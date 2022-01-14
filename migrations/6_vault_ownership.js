const { VaultMultisigOwner } = require('../configurations/config');

const Vault = artifacts.require('Vault');

module.exports = async (deployer, network, accounts) => {
    const network_id = deployer.network_id.toString();
    const addresses = require(`../configurations/${network_id}/Addresses.json`);
    
    this.Vault = await Vault.at(addresses[network_id]['Vault']);

    const ADMIN_ROLE = await this.Vault.DEFAULT_ADMIN_ROLE();
    await this.Vault.grantRole(ADMIN_ROLE, VaultMultisigOwner[network_id]);
    await this.Vault.renounceRole(ADMIN_ROLE, accounts[0], { from: accounts[0]});
}