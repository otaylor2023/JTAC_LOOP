FreeTAKServer certificates copied from the fts-freetakserver container (/opt/fts/certs).

WinTAK / TAK client (SSL streaming, usually port 8089):
  - Trust CA: ca.pem
  - Client identity (PKCS#12): Client.p12
  - Alternative PEM materials: Client.pem, Client.key (advanced setups)

Server bundle reference:
  - server.p12 / server.pem — server identity (often not needed on the client)

Password for Client.p12 / server.p12 matches FTS_CLIENT_CERT_PASSWORD in deploy/.env
(If you never changed it, the default in .env.example is supersecret).

Regenerate this folder by re-running from the project root:
  docker cp fts-freetakserver:/opt/fts/certs/. "deploy/fts-certs/"

Do not commit this directory to a public repository; it contains private keys.
