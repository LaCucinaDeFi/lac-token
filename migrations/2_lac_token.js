const {saveAddress} = require('../scripts/saveAddress');
const {LacOwner} = require('../configurations/config');
const LacToken = artifacts.require('LacToken');
const {ether} = require('@openzeppelin/test-helpers');

module.exports = async function (deployer, network, accounts) {
	console.log('====== Deploying LAC token ======');
	await deployer.deploy(LacToken, 'Lacucina Token', 'LAC', accounts[0], ether('500000000'));

	const deployedInstance = await LacToken.deployed();
	console.log('Contract Address: ', deployedInstance.address);
	await saveAddress('LacToken', deployedInstance.address, deployer.network_id.toString());
};
