const LacToken = {
  1: "",
  3: "",
  4: "",
  42: "",
  56: "0xe6f079e74000a0afc517c1eff9624d866d163b75",
  97: "0xC2404BC978Fca4fB9a426a041cadfCd4CE4c1086",
  1111: "0xC2404BC978Fca4fB9a426a041cadfCd4CE4c1086",
};

const VaultMultisigOwner = {
  1: "",
  3: "",
  4: "",
  42: "",
  56: "0x759ac5fD380383CE241482eE9A79240C86Fd1Bee",
  97: "0x24d7f4128a3A4156891c66922A53216955092f6F",
  1111: "0x24d7f4128a3A4156891c66922A53216955092f6F",
};

const VaultKeepers = {
  1: [],
  3: [],
  4: [],
  42: [],
  56: ["0xD74613187CA0905876cF03297eeFe90Da1d4B983"],
  97: [
    "0xB80f7dce64eAb24Fe11Ad746174bb70C10B34630",
    "0x35C99B54D9325d6C692363Ba0f6Bf38a68D6cA6e",
    "0x1593B3d9955bB76B96C7bb9238496f933e2e46Ff",
    "0x8fd2B4581673319C98ea01Cb2D9879A1a2A0F060",
  ],
  1111: [],
};

const VaultParams = {
  1: {},
  3: {},
  4: {},
  42: {},
  56: {
    initialRelease: "90000000",
    finalRelease: "10",
    changePercentage: "-30",
    changeRateAfterPeriod: "10512000", // 1 year in BSC blocks --> 28800 blocks/day * 365
    totalBlocksPerPeriod: "10512000", // 1 year in BSC blocks --> 28800 blocks/day * 365
  },
  97: {
    initialRelease: "1500000",
    finalRelease: "10",
    changePercentage: "-10",
    changeRateAfterPeriod: "30000", // 1 year in BSC blocks --> 28800 blocks/day * 365 --> DIVIDED BY 10
    totalBlocksPerPeriod: "30000", // 1 year in BSC blocks --> 28800 blocks/day * 365 --> DIVIDED BY 10
  },
  1111: {
    initialRelease: "90000000",
    finalRelease: "10",
    changePercentage: "-1",
    changeRateAfterPeriod: "28800", // 1 days --> 28800
    totalBlocksPerPeriod: "28800", // 1 day in BSC blocks --> 1 block / 3 sec --> 20 blocks / min --> 1200 blocks / hour
  },
};

const FundRecevers = {
  1: [],
  3: [],
  4: [],
  42: [],
  56: [
    {
      fundName: "Ovens",
      percentage: 93,
    },
    {
      fundName: "LaCucina",
      percentage: 7,
    },
  ],
  97: [
    {
      fundName: "Ovens",
      percentage: 80,
    },
    {
      fundName: "LaCucina",
      percentage: 20,
    },
  ],
  1111: [
    {
      fundName: "Ovens",
      percentage: 90,
    },
    {
      fundName: "LaCucina",
      percentage: 10,
    },
  ],
};

module.exports = { LacToken, VaultParams, FundRecevers, VaultKeepers, VaultMultisigOwner };
