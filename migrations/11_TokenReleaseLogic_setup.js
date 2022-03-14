const {FundRecevers} = require('../configurations/config');

const TokenReleaseScheduleLogic = artifacts.require('TokenReleaseScheduleLogic');

module.exports = async (deployer) => {
	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	this.TokenReleaseScheduleLogic = await TokenReleaseScheduleLogic.at(
		addresses[network_id]['TokenReleaseScheduleLogic']
	);

	const fundRecieverNames = [];
	const fundRecieverPercentages = [];

	for (let receiver of FundRecevers[network_id]) {
		fundRecieverNames.push(receiver.fundName);
		fundRecieverPercentages.push(receiver.percentage);
	}

	await this.TokenReleaseScheduleLogic.setup(fundRecieverNames, fundRecieverPercentages);
};
