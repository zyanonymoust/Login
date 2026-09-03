using Login.Server.Data;
using Login.Server.DTOs;
using Login.Server.Models;
using Login.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using Microsoft.AspNetCore.RateLimiting;
using System.IdentityModel.Tokens.Jwt;

namespace Login.Server.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly TokenService _tokenService;

    public AuthController(
        AppDbContext db,
        TokenService tokenService)
    {
        _db = db;
        _tokenService = tokenService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(
        RegisterRequest request)
    {
        var email = request.Email
            .Trim()
            .ToLowerInvariant();

        var emailExists = await _db.Users
            .AnyAsync(user => user.Email == email);

        if (emailExists)
        {
            return Conflict(new
            {
                message = "Email already exists."
            });
        }

        var user = new User
        {
            Name = request.Name.Trim(),
            Email = email,
            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        if (user.Id <= 2)
        {
            user.IsAdmin = true;
            await _db.SaveChangesAsync();
        }

        var tokenResult = _tokenService.CreateToken(user);
        await SaveSession(user.Id, request.DeviceId, tokenResult.TokenId, tokenResult.Expiration);

        return Ok(new AuthResponse
        {
            UserId = user.Id,
            Name = user.Name,
            Email = user.Email,
            Token = tokenResult.Token,
            Expiration = tokenResult.Expiration
            ,IsAdmin = user.IsAdmin,
            MustChangePassword = user.MustChangePassword
        });
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(
        LoginRequest request)
    {
        var email = request.Email
            .Trim()
            .ToLowerInvariant();

        var user = await _db.Users
            .FirstOrDefaultAsync(user => user.Email == email);

        if (user is null)
        {
            return Unauthorized(new
            {
                message = "Invalid email or password."
            });
        }

        var passwordIsValid =
            BCrypt.Net.BCrypt.Verify(
                request.Password,
                user.PasswordHash);

        if (!passwordIsValid)
        {
            return Unauthorized(new
            {
                message = "Invalid email or password."
            });
        }

        var tokenResult = _tokenService.CreateToken(user);
        var deviceId = NormalizeDeviceId(request.DeviceId);
        var now = DateTime.UtcNow;
        var activeSessions = await _db.UserSessions
            .Where(session => session.UserId == user.Id && session.IsActive && session.ExpiresAt > now)
            .ToListAsync();
        var deviceSession = activeSessions.FirstOrDefault(session => session.DeviceId == deviceId);

        if (deviceSession is null && activeSessions.Count >= 2)
        {
            return Conflict(new
            {
                message = "This account is already signed in on two devices. Sign out on another device before trying again."
            });
        }

        user.Status = "Available";
        user.LastSeenAt = now;
        if (user.Id <= 2) user.IsAdmin = true;
        await SaveSession(user.Id, deviceId, tokenResult.TokenId, tokenResult.Expiration, deviceSession);

        return Ok(new AuthResponse
        {
            UserId = user.Id,
            Name = user.Name,
            Email = user.Email,
            Token = tokenResult.Token,
            Expiration = tokenResult.Expiration
            ,IsAdmin = user.IsAdmin,
            MustChangePassword = user.MustChangePassword
        });
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var tokenId = User.FindFirstValue(JwtRegisteredClaimNames.Jti);
        if (!string.IsNullOrWhiteSpace(tokenId))
        {
            var session = await _db.UserSessions.FirstOrDefaultAsync(item => item.TokenId == tokenId);
            if (session is not null)
            {
                session.IsActive = false;
                await _db.SaveChangesAsync();
            }
        }

        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var userIdValue =
            User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(userIdValue, out var userId))
        {
            return Unauthorized();
        }

        var user = await _db.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => new
            {
                user.Id,
                user.Name,
                user.Email,
                user.Bio,
                user.Status,
                avatarUrl = user.AvatarData != null ? $"/api/social/avatar/{user.Id}" : null,
                user.CreatedAt
                ,user.IsAdmin,
                user.MustChangePassword
            })
            .FirstOrDefaultAsync();

        if (user is null)
        {
            return NotFound(new
            {
                message = "User not found."
            });
        }

        return Ok(user);
    }

    private async Task SaveSession(
        int userId,
        string? requestedDeviceId,
        string tokenId,
        DateTime expiration,
        UserSession? existing = null)
    {
        var deviceId = NormalizeDeviceId(requestedDeviceId);
        var session = existing ?? await _db.UserSessions
            .FirstOrDefaultAsync(item => item.UserId == userId && item.DeviceId == deviceId);

        if (session is null)
        {
            session = new UserSession
            {
                UserId = userId,
                DeviceId = deviceId,
                CreatedAt = DateTime.UtcNow
            };
            _db.UserSessions.Add(session);
        }

        session.TokenId = tokenId;
        session.LastUsedAt = DateTime.UtcNow;
        session.ExpiresAt = expiration;
        session.IsActive = true;
        await _db.SaveChangesAsync();
    }

    private static string NormalizeDeviceId(string? deviceId) =>
        string.IsNullOrWhiteSpace(deviceId)
            ? $"legacy-{Guid.NewGuid():N}"
            : deviceId.Trim();
}
