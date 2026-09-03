using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Login.Server.Tests;

public class AuthApiTests
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public AuthApiTests(
        CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task Register_WithValidData_ReturnsOk()
    {
        var email = CreateEmail();

        var response = await Register(email);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsConflict()
    {
        var email = CreateEmail();

        await Register(email);

        var response = await Register(email);

        Assert.Equal(
            HttpStatusCode.Conflict,
            response.StatusCode);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        var email = CreateEmail();

        await Register(email);

        var response = await _client.PostAsJsonAsync(
            "/api/auth/login",
            new
            {
                email,
                password = "wrong-password"
            });

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            response.StatusCode);
    }

    [Fact]
    public async Task Login_WithCorrectPassword_ReturnsToken()
    {
        var email = CreateEmail();

        await Register(email);

        var response = await _client.PostAsJsonAsync(
            "/api/auth/login",
            new
            {
                email,
                password = "123456"
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content
            .ReadFromJsonAsync<JsonElement>();

        var token = json.GetProperty("token").GetString();

        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public async Task Me_WithoutToken_ReturnsUnauthorized()
    {
        var response = await _client.GetAsync(
            "/api/auth/me");

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            response.StatusCode);
    }

    [Fact]
    public async Task Login_OnThirdDevice_ReturnsConflict()
    {
        var email = CreateEmail();
        await Register(email, "device-one");

        var first = await Login(email, "device-one");
        var second = await Login(email, "device-two");
        var third = await Login(email, "device-three");

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, third.StatusCode);
    }

    private async Task<HttpResponseMessage> Register(
        string email,
        string? deviceId = null)
    {
        return await _client.PostAsJsonAsync(
            "/api/auth/register",
            new
            {
                name = "Test User",
                email,
                password = "123456",
                confirmPassword = "123456",
                deviceId
            });
    }

    private async Task<HttpResponseMessage> Login(string email, string deviceId)
    {
        return await _client.PostAsJsonAsync(
            "/api/auth/login",
            new { email, password = "123456", deviceId });
    }

    private static string CreateEmail()
    {
        return $"test-{Guid.NewGuid():N}@example.com";
    }
}
