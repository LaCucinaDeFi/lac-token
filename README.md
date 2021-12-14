# LAC Token

LAC token contract is ERC20 token contract which performs the minting of tokens only once at the time of contract initialization.

LAC tokens are minted to the preMint wallet address at the time of deployment.


# Vault Contract

The Vault contract is upgradeable contract which holds the LAC tokens and distributes it to the fund receivers according to their share. It uses the EIP712 standard for the secured claiming of LAC tokens. Users can then claim these tokens from specific fund receivers. 

The main motive behind the vault contract is to allow the users to claim the rewards in LAC token from the fund receivers.

## Constructor / Initializer

  The Vault contract takes the following parameters for initializing the contract.

* **_name**: name of the contract.
* **_version**: version of contract.
* **_lacAddress**: Indicates the LAC token address.
* **_initialReleaseRatePerPeriod**: Indicates the initial release rate for a period which is set as a current release rate for a period. here period duration is specified in weeks. Vault distributes this number of LAC tokens per week to the fund receivers.
  
  Using the currentReleaseRatePerPeriod we calculate the current release rate per block.
  Formula for calculating the current release rate per block is given below: 

  ```
  currentReleaseRatePerBlock =  currentReleaseRatePerPeriod / (1 weeks / blockTime);
  ```
  here, blockTime is block time of underlying chain. in our case it is set to 3 due to bsc chain.
  above we divide the total no. of tokens to distribute in period by the total no. of blocks in period.
 * **_finalReleaseRatePerPeriod**: Indicates the maximum no. of LAC tokens to distribute per period. Once we cross the maximum no. of release rate, we don`t update the release rate afterwards. here, once we reach the finalReleaseRatePerPeriod then we set the currentReleaseRatePerPeriod to finalReleaseRatePerPeriod and calculates per block release rate. Then we keep distributing the tokens at this rate.
 * **_increasePercent**: Indicates the percentage for increasing the per period release rate.
 When we complete the certain no. of periods, we increase the currentRelease rate by this no. of percentage. 
 
    ex. currenteReleaseRatePerPeriod = 1000000,  changePercentage = 5%, no. of periods to complete =4 weeks.
    Here, when we complete the 4 weeks of duration, we calculate the new currentReleaseRatePerPeriod using the following formula.
    ```
    increaseAmount = (currenteReleaseRatePerPeriod * changePercentage) / 10000
    
    i.e
    
    increaseAmount = (1000000 * 5) / 10000 = 500

    currentReleaseRatePerPeriod = currentReleaseRatePerPeriod + increaseAmount;
    ```
   we also update the per block release rate according to the current releaseRatePerPeriod using the following formula.
    ```
    currentReleaseRatePerBlock =  currentReleaseRatePerPeriod / (1 weeks / blockTime);
    ```
 * **_increaseRateAfterPeriod**: Indicates the period duration in weeks after which we update the release rates until we reach the maximum release rate.  



## Features of Vault
### Manages fund receivers:
  
  Admin can add new fund receivers, remove existing receivers, update the shares of receivers and shrink the fund receivers to add a new fund receiver.

  Whenever we perform any of the above operation, we update the accumulated funds of the receivers first.

### Per block LAC token distribution:
  
  Vault allocates the LAC tokens to funds receivers according to their shares.
  This distribution happens per block.
  
  ex. Vault have 2 fund receivers f1 and f2 with share of 80% and 20% respectively. It distributes 100 tokens per block.
  
  so here, f1 will get 80 tokens and f2 will get 20 tokens per block.

### Secured claiming of LAC rewards.

  Vault allows users to claim the tokens from the fund receiver`s accumulated tokens. In order to claim the tokens users must have the signature signed by the operator which is one of the fund receiver. 
  Vault uses the EIP712 standard for the signature verification which makes it more secured.

  