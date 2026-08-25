using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Login.Server.Data.Migrations
{
    public partial class PublicRooms : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPublic",
                table: "GroupRooms",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsPublic",
                table: "GroupRooms");
        }
    }
}
