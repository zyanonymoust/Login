using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Login.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class MultipleWorldAnnouncements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorldAnnouncements",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Content = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedById = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorldAnnouncements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorldAnnouncements_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WorldAnnouncements_CreatedById",
                table: "WorldAnnouncements",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_WorldAnnouncements_ExpiresAt",
                table: "WorldAnnouncements",
                column: "ExpiresAt");

            migrationBuilder.Sql("""
                INSERT INTO "WorldAnnouncements" ("Content", "CreatedAt", "ExpiresAt", "CreatedById")
                SELECT settings."Announcement", settings."UpdatedAt", NULL,
                       COALESCE(
                           (SELECT users."Id" FROM "Users" users WHERE users."Id" = settings."UpdatedById"),
                           (SELECT users."Id" FROM "Users" users ORDER BY users."Id" LIMIT 1)
                       )
                FROM "WorldChatSettings" settings
                WHERE settings."Id" = 1
                  AND LENGTH(TRIM(settings."Announcement")) > 0
                  AND EXISTS (SELECT 1 FROM "Users");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorldAnnouncements");
        }
    }
}
