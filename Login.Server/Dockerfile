FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base

WORKDIR /app

EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080


FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY ["Login.Server/Login.Server.csproj", "Login.Server/"]

RUN dotnet restore "Login.Server/Login.Server.csproj"

COPY . .

WORKDIR "/src/Login.Server"

RUN dotnet build "Login.Server.csproj" -c Release -o /app/build /P:UseAppHost=false


FROM base AS final

WORKDIR /app

COPY --from=build /app/build .

ENTRYPOINT ["dotnet", "Login.Server.dll"]