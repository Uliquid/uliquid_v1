const hre = require("hardhat");


async function deploySwap(WETH=null) {
    if (!WETH)
        WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    const Swap = await hre.ethers.getContractFactory("Swap")
    let swap = await Swap.deploy(WETH)
    await swap.deployed()
    return  swap
  }







module.exports = {
    deploySwap
}