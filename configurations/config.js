const LacToken = {
    1: '',
    3: '',
    4: '',
    42: '',
    56: '0xC2404BC978Fca4fB9a426a041cadfCd4CE4c1086', // TODO:  Update for mainnet
    97: '0xC2404BC978Fca4fB9a426a041cadfCd4CE4c1086', // LAC
    1111: '0xC2404BC978Fca4fB9a426a041cadfCd4CE4c1086',
}

const VaultParams = {
    1: {},
    3: {},
    4: {},
    42: {},
    56: {
        // TODO: To be defined
        initialRelease: '',
        maxRelease: '',
        increasePercentage: '',
        increasePeriodNumber: '1',
        increasePeriodName: 'weeks'
    },
    97: {
        initialRelease: '2016000', // 10 token per block
        maxRelease: '20160000', // 100 tokens per block
        increasePercentage: '5', // 5%
        increasePeriodNumber: '2', // 2 days 
        increasePeriodName: 'days' // 2 days 
    },
    1111: {
        initialRelease: '2016000', // 10 token per block
        maxRelease: '20160000', // 100 tokens per block
        increasePercentage: '5', // 5%
        increasePeriodNumber: '2', // 2 days 
        increasePeriodName: 'days' // 2 days 
    },
}

const FundRecevers = {
    1: [],
    3: [],
    4: [],
    42: [],
    56: [],
    97: [
        {
            address: '0x5228fB3C3f88C57723A7F9e4f6119139e030640e',
            fundName: 'Ovens',
            percentage: 90
        },
        {
            address: '0xEC09956f6A47B3851E942f24d2aF3B8CFDa2269D',
            fundName: 'LaCucina',
            percentage: 10
        }
    ],
    1111: [
        {
            address: '0x5228fB3C3f88C57723A7F9e4f6119139e030640e',
            fundName: 'Ovens',
            percentage: 90
        },
        {
            address: '0xEC09956f6A47B3851E942f24d2aF3B8CFDa2269D',
            fundName: 'LaCucina',
            percentage: 10
        }
    ]
}

module.exports = { LacToken, VaultParams, FundRecevers };