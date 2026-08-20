var builder =
    DistributedApplication.CreateBuilder(args);

var postgres =
    builder
        .AddPostgres("postgres")
        .WithDataVolume();

var loginDatabase =
    postgres.AddDatabase("logindb");

var server =
    builder
        .AddProject<Projects.Login_Server>(
            "server"
        )
        .WithReference(loginDatabase)
        .WaitFor(loginDatabase)
        .WithExternalHttpEndpoints();

builder
    .AddViteApp(
        "frontend",
        "../frontend"
    )
    .WithEndpoint(
        "http",
        endpoint =>
            endpoint.Port = 3002
    )
    .WithReference(server)
    .WaitFor(server)
    .WithExternalHttpEndpoints();

builder.Build().Run();