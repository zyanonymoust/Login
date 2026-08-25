using Login.Server.Data;
using Login.Server.DTOs;
using Login.Server.Models;
using Login.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Login.Server.Controllers;

[ApiController]
[Route("api/auth")]
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

        var tokenResult = _tokenService.CreateToken(user);

        return Ok(new AuthResponse
        {
            UserId = user.Id,
            Name = user.Name,
            Email = user.Email,
            Token = tokenResult.Token,
            Expiration = tokenResult.Expiration
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

        return Ok(new AuthResponse
        {
            UserId = user.Id,
            Name = user.Name,
            Email = user.Email,
            Token = tokenResult.Token,
            Expiration = tokenResult.Expiration
        });
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
                user.CreatedAt
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
}
