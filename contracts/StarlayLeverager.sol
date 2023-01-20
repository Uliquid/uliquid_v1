pragma solidity 0.8.9;


import './AaveLeverage.sol';




contract StarlayLeverage is AaveLeverage {

    constructor(
        address _admin,
        address payable _swapper,
        address [] memory _approvedLendingPools
    ) AaveLeverage(
        _admin,
        _swapper,
         _approvedLendingPools
    ) public {

    }
    receive() external payable {

    }

    
}