const {ether} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const {saveAddress} = require('../scripts/saveAddress');

const MasterVault = artifacts.require('MasterVault');
const DORMANT_DURATION_IN_SECONDS = 60;

module.exports = async function (deployer) {
	const network_id = deployer.network_id.toString();

	this.MasterVault = await deployProxy(MasterVault, [DORMANT_DURATION_IN_SECONDS], {
		initializer: 'initialize'
	});

	console.log('Contract Address: ', this.MasterVault.address);
	await saveAddress('MasterVault', this.MasterVault.address, network_id);
};
