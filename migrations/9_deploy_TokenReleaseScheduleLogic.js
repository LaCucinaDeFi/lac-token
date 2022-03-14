const {ether} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const {saveAddress} = require('../scripts/saveAddress');
const {VaultParams} = require('../configurations/config');

const TokenReleaseScheduleLogic = artifacts.require('TokenReleaseScheduleLogic');

module.exports = async function (deployer) {
	const DECIMAL_FIXER_FOR_PERCENTAGE = 100;

	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	await deployer.deploy(
		TokenReleaseScheduleLogic,
		addresses[network_id].MasterVault, // vault Address
		addresses[network_id].LacToken, // lac token
		ether(VaultParams[network_id].initialRelease), // initial release rate
		ether(VaultParams[network_id].finalRelease), // final release rate
		Number(VaultParams[network_id].changePercentage) * DECIMAL_FIXER_FOR_PERCENTAGE, // change percentage
		Number(VaultParams[network_id].totalBlocksPerPeriod) // blocks per period
	);
	this.TokenReleaseScheduleLogic = await TokenReleaseScheduleLogic.deployed();
	console.log('Contract Address: ', this.TokenReleaseScheduleLogic.address);
	await saveAddress(
		'TokenReleaseScheduleLogic',
		this.TokenReleaseScheduleLogic.address,
		network_id
	);
};
