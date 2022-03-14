const {VaultMultisigOwner} = require('../configurations/config');

const TokenReleaseScheduleLogic = artifacts.require('TokenReleaseScheduleLogic');

module.exports = async (deployer, network, accounts) => {
	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	this.TokenReleaseScheduleLogic = await TokenReleaseScheduleLogic.at(
		addresses[network_id]['TokenReleaseScheduleLogic']
	);

	const ADMIN_ROLE = await this.TokenReleaseScheduleLogic.DEFAULT_ADMIN_ROLE();
	await this.TokenReleaseScheduleLogic.grantRole(ADMIN_ROLE, VaultMultisigOwner[network_id]);
	await this.TokenReleaseScheduleLogic.renounceRole(ADMIN_ROLE, accounts[0], {from: accounts[0]});
};
