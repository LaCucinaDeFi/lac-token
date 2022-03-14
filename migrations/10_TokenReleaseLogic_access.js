const {VaultKeepers} = require('../configurations/config');

const TokenReleaseScheduleLogic = artifacts.require('TokenReleaseScheduleLogic');

module.exports = async (deployer) => {
	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	this.TokenReleaseScheduleLogic = await TokenReleaseScheduleLogic.at(
		addresses[network_id]['TokenReleaseScheduleLogic']
	);

	const VAULT_KEEPER_ROLE = await this.TokenReleaseScheduleLogic.VAULT_KEEPER();
	for (let wallet of VaultKeepers[network_id]) {
		await this.TokenReleaseScheduleLogic.grantRole(VAULT_KEEPER_ROLE, wallet);
	}
};
