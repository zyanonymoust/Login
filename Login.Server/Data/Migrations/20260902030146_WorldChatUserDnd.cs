using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Login.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorldChatUserDnd : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "WorldChatDoNotDisturb",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WorldChatDoNotDisturb",
                table: "Users");
        }
    }
}
