const { VaultKeepers } = require("../configurations/config");

const Vault = artifacts.require('Vault');

module.exports = async (deployer) => {
    const network_id = deployer.network_id.toString();
    const addresses = require(`../configurations/${network_id}/Addresses.json`);

    this.Vault = await Vault.at(addresses[network_id]['Vault']);

    const VAULT_KEEPER_ROLE = await this.Vault.VAULT_KEEPER();
    for (let wallet of VaultKeepers[network_id]) {
        await this.Vault.grantRole(VAULT_KEEPER_ROLE, wallet);
    }
}