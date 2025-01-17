module.exports = (db) => {
	return (expressApp, clients) => {

		// Admin authenticator middleware for the secrets management routes
		expressApp.use('/secrets/', async (req, res, next) => {
			const client = clients.get(req.validatedRequest.chain)
			if (!client) {
				res.status(400)
				res.set('content-type', 'application/json')
				res.send({
					error: `Unsupported chain: ${req.validatedRequest.chain}!`
				})
			}

			const vault = await client.getVault(req.validatedRequest.vault)
			if (!vault) {
				res.status(404)
				res.set('content-type', 'application/json')
				res.send({
					error: `Vault ${req.validatedRequest.vault} on chain ${req.validatedRequest.chain} does not exist!`
				})
			} else {
				const operator = await vault.getAdminAddress()
				if (operator.toLowerCase() === req.body.address.toLowerCase()) {
					next()
				} else {
					res.status(403)
					res.set('content-type', 'application/json')
					res.send({
						error: `This endpoint can only be called by the Vault operator (${operator})`
					})
				}
			}
		})

		expressApp.post('/secrets/list', async (req, res) => {
			// Get secrets from DB
			const secrets = await db.listSecrets(req.validatedRequest.vault, req.validatedRequest.chain)

			res.status(200)
			res.set('content-type', 'application/json')
			res.send(secrets)
		})

		expressApp.post('/secrets/create', async (req, res) => {
			// Insert new secret to DB
			const secret = await db.createAppSecret(req.validatedRequest.vault, req.validatedRequest.chain, req.validatedRequest.name)

			res.status(200)
			res.set('content-type', 'application/json')
			res.send(secret)
		})

		expressApp.post('/secrets/delete', async (req, res) => {
			const secret = await db.getAppSecret(req.validatedRequest.secret)

			if (secret) {
				// Delete secret
				await db.deleteAppSecret(secret.secret)

				res.status(200)
				res.set('content-type', 'application/json')
				res.send(secret)
			} else {
				res.status(404)
				res.set('content-type', 'application/json')
				res.send({
					error: 'Secret not found'
				})
			}
		})
	}
}