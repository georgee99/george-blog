# George's Blog
https://georgeelz.blog/

Simple and minimal. Nothing special about this, just for fun.

## Development

### Lambdas deployment:
cd C:\Users\gelza\Dev\george-blog\lambda\create-comment

npx serverless deploy --stage prod

if doing a fresh deploy, will need to reset the env variables


### DB Connection
Connection details are stored in `.env.local` (not committed). See `.env.local` for the full `psql` connection string.

Requires `global-bundle.pem` in the repo root (RDS SSL cert):
```
curl -o global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

### Admin
E.g. removing bad comments. Connect to the db using the psql command and run sql query manually

```
Select * from comments where ....

DELETE FROM comments WHERE id = 'abc123...';
```