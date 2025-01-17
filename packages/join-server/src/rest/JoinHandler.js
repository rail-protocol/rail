const domain = require('../domain')
const { ErrorMessage } = require('./ErrorMessage')

class JoinHandler {
	constructor(logger, joinRequestService, customJoinRequestValidator) {
		this.logger = logger
		this.joinRequestService = joinRequestService
		this.customJoinRequestValidator = customJoinRequestValidator
	}

	sendJsonResponse(res, status, response) {
		res.set('content-type', 'application/json')
		res.status(status)
		res.send(response)
	}

	sendJsonError(res, status, message) {
		const errorMessage = new ErrorMessage(message)
		this.sendJsonResponse(res, status, errorMessage)
	}

	async handle(req, res, _next) {
		let beneficiary
		try {
			beneficiary = new domain.Address(req.body.address)
		} catch (err) {
			this.sendJsonError(res, 400, `Invalid beneficiary address: '${err.address}'`)
			return
		}

		let vault
		try {
			vault = new domain.Address(req.validatedRequest.vault)
		} catch (err) {
			this.sendJsonError(res, 400, `Invalid Vault contract address: '${err.address}'`)
			return
		}

		let chain
		try {
			chain = domain.Chain.fromName(req.validatedRequest.chain)
		} catch (err) {
			this.sendJsonError(res, 400, `Invalid chain name: '${req.validatedRequest.chain}'`)
			return
		}

		try {
			await this.customJoinRequestValidator(req.body.address, req.validatedRequest)
		} catch (err) {
			this.sendJsonError(res, 400, `Join request failed custom validation: '${err}'`)
			return
		}

		try {
			const joinResponse = await this.joinRequestService.create(beneficiary.toString(), vault.toString(), chain.toString())
			this.logger.info(joinResponse)
			this.sendJsonResponse(res, 200, joinResponse)
		} catch (err) {
			this.logger.info(err)
			this.sendJsonError(res, 400, err.message)
		}
	}
}

module.exports = {
	JoinHandler,
}