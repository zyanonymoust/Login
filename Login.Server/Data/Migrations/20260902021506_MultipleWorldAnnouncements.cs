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
                SELECT "Announcement", "UpdatedAt", NULL, COALESCE("UpdatedById", 1)
                FROM "WorldChatSettings"
                WHERE "Id" = 1 AND LENGTH(TRIM("Announcement")) > 0;
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
