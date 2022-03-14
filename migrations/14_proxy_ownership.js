const {admin} = require('@openzeppelin/truffle-upgrades');
const {VaultMultisigOwner} = require('../configurations/config');

module.exports = async (deployer) => {
	const network_id = deployer.network_id.toString();
	await admin.transferProxyAdminOwnership(VaultMultisigOwner[network_id]);
};
