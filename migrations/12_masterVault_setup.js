const MasterVault = artifacts.require('MasterVault');
const {supportedTokensForMasterVault} = require('../configurations/config');

module.exports = async (deployer) => {
	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	this.MasterVault = await MasterVault.at(addresses[network_id]['MasterVault']);

	await this.MasterVault.addLogicContract(
		addresses[network_id]['TokenReleaseScheduleLogic'],
		'TokenReleaseScheduleLogic'
	);

	// add claimable supported Tokens in master vault
	for (let token of supportedTokensForMasterVault) {
		await this.MasterVault.addSupportedToken(token[network_id]);
	}
};
