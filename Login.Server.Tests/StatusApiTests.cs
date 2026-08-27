using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Login.Server.Tests;

public class StatusApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public StatusApiTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task InvisibleUserAppearsOfflineToOtherPeople()
    {
        var invisible = await CreateUser("Invisible User");
        var viewer = await CreateUser("Viewer");
        var change = await invisible.Client.PutAsJsonAsync("/api/social/status", new { status = "Invisible" });
        change.EnsureSuccessStatusCode();

        var people = await viewer.Client.GetFromJsonAsync<JsonElement>("/api/social/people");
        var person = people.EnumerateArray().Single(x => x.GetProperty("id").GetInt32() == invisible.Id);

        Assert.False(person.GetProperty("online").GetBoolean());
        Assert.Equal("Offline", person.GetProperty("status").GetString());
    }

    [Fact]
    public async Task InvalidStatusIsRejected()
    {
        var user = await CreateUser("Status User");
        var response = await user.Client.PutAsJsonAsync("/api/social/status", new { status = "Gaming" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task<(HttpClient Client, int Id)> CreateUser(string name)
    {
        var client = _factory.CreateClient();
        var email = $"status-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/auth/register", new { name, email, password = "123456", confirmPassword = "123456" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", json.GetProperty("token").GetString());
        return (client, json.GetProperty("userId").GetInt32());
    }
}
