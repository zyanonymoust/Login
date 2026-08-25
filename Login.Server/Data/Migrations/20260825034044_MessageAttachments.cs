using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Login.Server.Data.Migrations
{
    public partial class MessageAttachments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttachmentContentType",
                table: "Messages",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "AttachmentData",
                table: "Messages",
                type: "bytea",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AttachmentName",
                table: "Messages",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);
        }
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentContentType",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "AttachmentData",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "AttachmentName",
                table: "Messages");
        }
    }
}
