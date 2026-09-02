using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Login.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class PinnedChannelMessages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "WorldMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "GroupMessages",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "WorldMessages");

            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "GroupMessages");
        }
    }
}
