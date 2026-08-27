using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Login.Server.Tests;

public class ProfileSecurityApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public ProfileSecurityApiTests(CustomWebApplicationFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task PasswordChangeRequiresCorrectCurrentPassword()
    {
        await Authenticate();
        var wrong = await _client.PutAsJsonAsync("/api/social/password", new { currentPassword = "wrong", newPassword = "new-password", confirmPassword = "new-password" });
        var correct = await _client.PutAsJsonAsync("/api/social/password", new { currentPassword = "123456", newPassword = "new-password", confirmPassword = "new-password" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, correct.StatusCode);
    }

    [Fact]
    public async Task AvatarRejectsUnsupportedExtension()
    {
        await Authenticate();
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent([1, 2, 3]);
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "avatar.exe");
        var response = await _client.PostAsync("/api/social/avatar", form);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task Authenticate()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/register", new { name = "Profile User", email = $"profile-{Guid.NewGuid():N}@example.com", password = "123456", confirmPassword = "123456" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        _client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", json.GetProperty("token").GetString());
    }
}
