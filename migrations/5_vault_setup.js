const { FundRecevers } = require("../configurations/config");

const Vault = artifacts.require("Vault");

module.exports = async (deployer) => {
  const network_id = deployer.network_id.toString();
  const addresses = require(`../configurations/${network_id}/Addresses.json`);

  this.Vault = await Vault.at(addresses[network_id]["Vault"]);

  const fundRecieverNames = [];
  const fundRecieverPercentages = [];

  for (let receiver of FundRecevers[network_id]) {
    fundRecieverNames.push(receiver.fundName);
    fundRecieverPercentages.push(receiver.percentage);
  }

  await this.Vault.setup(fundRecieverNames, fundRecieverPercentages);
};
