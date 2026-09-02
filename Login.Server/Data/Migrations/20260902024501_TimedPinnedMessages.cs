using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Login.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class TimedPinnedMessages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PinnedUntil",
                table: "WorldMessages",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PinnedUntil",
                table: "GroupMessages",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinnedUntil",
                table: "WorldMessages");

            migrationBuilder.DropColumn(
                name: "PinnedUntil",
                table: "GroupMessages");
        }
    }
}
