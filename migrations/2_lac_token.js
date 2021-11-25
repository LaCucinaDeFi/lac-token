
const {saveAddress} = require('../scripts/saveAddress');
const {LacOwner} = require('../configurations/config');
const LacToken = artifacts.require("LacToken");

module.exports = async function (deployer) {
    console.log('====== Deploying LAC token ======');
    await deployer.deploy(LacToken);

    const deployedInstance = await LacToken.deployed();
	console.log('Contract Address: ',deployedInstance.address);
    await saveAddress('LacToken', deployedInstance.address, deployer.network_id.toString());

    console.log('====== Transfering Ownership ======');
    await deployedInstance.transferOwnership(LacOwner[deployer.network_id.toString()]);
};