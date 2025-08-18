# graphql
# My Reboot01 Profile

Static, no-framework profile page using the platform GraphQL.

## Run locally

- Go: `go run main.go`

Then visit `http://localhost:8080`.

## Deploy
Drop the folder to Netlify (recommended). Or GitHub Pages (may hit CORS for signin).

## Features
- Basic → JWT signin (username/email + password)
- Bearer GraphQL queries
- Shows basic info, total XP, latest results
- Two SVG charts: XP over time, XP by project
