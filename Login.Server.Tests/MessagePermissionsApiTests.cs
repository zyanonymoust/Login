using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Login.Server.Tests;

public class MessagePermissionsApiTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public MessagePermissionsApiTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task OnlySenderCanEditOrDeleteMessage()
    {
        var sender = await CreateUser("Sender");
        var recipient = await CreateUser("Recipient");
        var sent = await sender.Client.PostAsJsonAsync($"/api/messages/{recipient.Id}", new { content = "Original" });
        sent.EnsureSuccessStatusCode();
        var json = await sent.Content.ReadFromJsonAsync<JsonElement>();
        var messageId = json.GetProperty("id").GetInt64();

        var recipientEdit = await recipient.Client.PutAsJsonAsync($"/api/messages/item/{messageId}", new { content = "Changed by recipient" });
        var recipientDelete = await recipient.Client.DeleteAsync($"/api/messages/item/{messageId}");
        var senderEdit = await sender.Client.PutAsJsonAsync($"/api/messages/item/{messageId}", new { content = "Changed by sender" });
        var senderDelete = await sender.Client.DeleteAsync($"/api/messages/item/{messageId}");

        Assert.Equal(HttpStatusCode.NotFound, recipientEdit.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, recipientDelete.StatusCode);
        Assert.Equal(HttpStatusCode.OK, senderEdit.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, senderDelete.StatusCode);
    }

    [Fact]
    public async Task ReplyMustReferenceMessageFromSameConversation()
    {
        var sender = await CreateUser("Reply Sender");
        var recipient = await CreateUser("Reply Recipient");
        var outsider = await CreateUser("Reply Outsider");
        var original = await sender.Client.PostAsJsonAsync($"/api/messages/{recipient.Id}", new { content = "Original" });
        original.EnsureSuccessStatusCode();
        var originalJson = await original.Content.ReadFromJsonAsync<JsonElement>();
        var originalId = originalJson.GetProperty("id").GetInt64();
        var outsideMessage = await outsider.Client.PostAsJsonAsync($"/api/messages/{sender.Id}", new { content = "Outside" });
        outsideMessage.EnsureSuccessStatusCode();
        var outsideJson = await outsideMessage.Content.ReadFromJsonAsync<JsonElement>();
        var outsideId = outsideJson.GetProperty("id").GetInt64();

        var validReply = await recipient.Client.PostAsJsonAsync($"/api/messages/{sender.Id}", new { content = "Valid reply", replyToId = originalId });
        var invalidReply = await sender.Client.PostAsJsonAsync($"/api/messages/{recipient.Id}", new { content = "Invalid reply", replyToId = outsideId });

        Assert.Equal(HttpStatusCode.OK, validReply.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidReply.StatusCode);
        var validJson = await validReply.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(originalId, validJson.GetProperty("replyTo").GetProperty("id").GetInt64());
    }

    [Fact]
    public async Task OnlyConversationParticipantsCanReact()
    {
        var sender = await CreateUser("Reaction Sender");
        var recipient = await CreateUser("Reaction Recipient");
        var outsider = await CreateUser("Reaction Outsider");
        var sent = await sender.Client.PostAsJsonAsync($"/api/messages/{recipient.Id}", new { content = "React here" });
        sent.EnsureSuccessStatusCode();
        var sentJson = await sent.Content.ReadFromJsonAsync<JsonElement>();
        var messageId = sentJson.GetProperty("id").GetInt64();

        var participantReaction = await recipient.Client.PostAsJsonAsync($"/api/messages/item/{messageId}/reactions", new { emoji = "👍" });
        var outsiderReaction = await outsider.Client.PostAsJsonAsync($"/api/messages/item/{messageId}/reactions", new { emoji = "👍" });
        var invalidReaction = await sender.Client.PostAsJsonAsync($"/api/messages/item/{messageId}/reactions", new { emoji = "unsupported" });

        Assert.Equal(HttpStatusCode.OK, participantReaction.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, outsiderReaction.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidReaction.StatusCode);
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
}
