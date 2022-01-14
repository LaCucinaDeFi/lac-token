const {ether} = require('@openzeppelin/test-helpers');
const {saveAddress} = require('../scripts/saveAddress');
const { LacToken } = require('../configurations/config');

const MockToken = artifacts.require('LacToken');

module.exports = async function (deployer, network, accounts) {
	const network_id = deployer.network_id.toString();
    if (network_id == '1111') {
        await deployer.deploy(MockToken, 'LaCucina Token', 'LAC', accounts[0], ether('500000000'));
		const lacToken = await MockToken.deployed();

        await saveAddress('LacToken', lacToken.address, network_id);
    } else {
        await saveAddress('LacToken', LacToken[network_id], network_id);
    }
};
