using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Login.Server.Tests;

public class GroupPermissionsApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public GroupPermissionsApiTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Member_CannotChangeRolesOrRemoveOtherMembers()
    {
        var owner = await CreateUser("Owner");
        var member = await CreateUser("Member");
        var third = await CreateUser("Third");
        var roomId = await CreateGroup(owner.Client);
        await InviteAndAccept(owner.Client, member, roomId);
        await InviteAndAccept(owner.Client, third, roomId);

        var roleResponse = await member.Client.PutAsJsonAsync($"/api/groups/{roomId}/members/{third.Id}/role", new { role = "admin" });
        var removeResponse = await member.Client.DeleteAsync($"/api/groups/{roomId}/members/{third.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, roleResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, removeResponse.StatusCode);
    }

    [Fact]
    public async Task Owner_CanPromoteAndRemoveMember()
    {
        var owner = await CreateUser("Owner");
        var member = await CreateUser("Member");
        var roomId = await CreateGroup(owner.Client);
        await InviteAndAccept(owner.Client, member, roomId);

        var roleResponse = await owner.Client.PutAsJsonAsync($"/api/groups/{roomId}/members/{member.Id}/role", new { role = "admin" });
        var removeResponse = await owner.Client.DeleteAsync($"/api/groups/{roomId}/members/{member.Id}");

        Assert.Equal(HttpStatusCode.OK, roleResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, removeResponse.StatusCode);
    }

    private async Task<(HttpClient Client, int Id)> CreateUser(string name)
    {
        var client = _factory.CreateClient();
        var email = $"{name.ToLowerInvariant()}-{Guid.NewGuid():N}@example.com";
        var response = await client.PostAsJsonAsync("/api/auth/register", new { name, email, password = "123456", confirmPassword = "123456" });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", json.GetProperty("token").GetString());
        return (client, json.GetProperty("userId").GetInt32());
    }

    private static async Task<int> CreateGroup(HttpClient owner)
    {
        var response = await owner.PostAsJsonAsync("/api/groups", new { name = "Permission Test", description = "Test", isPublic = false });
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        return json.GetProperty("id").GetInt32();
    }

    private static async Task InviteAndAccept(HttpClient owner, (HttpClient Client, int Id) member, int roomId)
    {
        var invite = await owner.PostAsync($"/api/groups/{roomId}/invite/{member.Id}", null);
        invite.EnsureSuccessStatusCode();
        var accept = await member.Client.PostAsync($"/api/groups/{roomId}/accept", null);
        accept.EnsureSuccessStatusCode();
    }
}
