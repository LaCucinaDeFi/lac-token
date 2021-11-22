const {deployProxy, admin} = require('@openzeppelin/truffle-upgrades');
const {ether, time} = require('@openzeppelin/test-helpers');

const {saveAddress} = require('../scripts/saveAddress');
const {LacToken, VaultParams, FundRecevers} = require('../configurations/config');

const Vault = artifacts.require('Vault');

module.exports = async function (deployer) {
	console.log('====== Deploying Vault ======');
    let instance = await deployProxy(Vault, [
        'LaCucina Vault',
        '1.0.0',
        LacToken[deployer.network_id.toString()],
        ether(VaultParams[deployer.network_id.toString()].initialRelease),
        ether(VaultParams[deployer.network_id.toString()].maxRelease),
        VaultParams[deployer.network_id.toString()].increasePercentage * 100,
        VaultParams[deployer.network_id.toString()].increasePeriodName === 'days' ? 
            time.duration.days(VaultParams[deployer.network_id.toString()].increasePeriodNumber) : 
            time.duration.weeks(VaultParams[deployer.network_id.toString()].increasePeriodNumber)  
    ], {
		initializer: 'initialize'
	});

	const deployedInstance = await Vault.deployed();
	console.log('Contract Address: ',deployedInstance.address);
    await saveAddress('Vault', deployedInstance.address, deployer.network_id.toString());

    // add fund receivecrs
	for (let i = 0; i < FundRecevers[deployer.network_id].length; i++) {
		await instance.addFundReceiverAddress(
            FundRecevers[deployer.network_id][i].address,
            FundRecevers[deployer.network_id][i].percentage,
        );
	}
};

