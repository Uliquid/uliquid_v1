pragma solidity 0.8.9;


import './AaveLiquidator.sol';



contract StarlayLiquidator is AaveLiquidator {

    constructor(
        address _admin,
        address _treasury,
        address payable _swapper,
        address [] memory _approvedLendingPools
    ) AaveLiquidator(
        _admin,
        _treasury,
        _swapper,
         _approvedLendingPools
    ) public {

    }
    receive() external payable {

    }

    
}