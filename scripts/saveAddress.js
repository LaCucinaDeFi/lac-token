const fs = require('fs');
const path = require('path');

const saveAddress = async (contractName, address, networkId) => {
    const fileData = {};
    const data = {};
    data[contractName] = address;
    fileData[networkId] = data;
    const addresssPath = await path.join(`configurations/${networkId}`, 'Addresses.json');
    await fs.writeFile(addresssPath, JSON.stringify(fileData), (err) => {
        if (err) throw err;
    });
}

module.exports = { saveAddress };