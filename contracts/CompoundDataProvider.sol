pragma solidity 0.8.9;
import {IERC20, SafeMath, Exponential} from './Libraries.sol';


interface IPriceOracle {    
    function latestAnswer() external view returns (uint);
    function getUnderlyingPrice(ICtoken _pToken) external view returns (uint);

}

interface ICtoken {
    function transfer(address dst, uint amount) external returns (bool);
    function transferFrom(address src, address dst, uint amount) external returns (bool);
    function approve(address spender, uint amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function balanceOfUnderlying(address owner) external returns (uint);
    function getAccountSnapshot(address account) external view returns (uint, uint, uint, uint);
    function borrowRatePerTimestamp() external view returns (uint);
    function supplyRatePerTimestamp() external view returns (uint);
    function totalBorrows() external view returns (uint);
    function totalBorrowsCurrent() external returns (uint);
    function borrowBalancesCurrent(address account) external view returns (uint);
    function borrowBalancesStored(address account) external view returns (uint);
    function exchangeRateCurrent() external  returns (uint);
    function exchangeRateStored() external view returns (uint);
    function getCash() external view returns (uint);
    function accrueInterest() external returns (uint);
    function seize(address liquidator, address borrower, uint seizeTokens) external returns (uint);
    function liquidateBorrow(address borrower, uint amount, address collateral) external returns (uint);
    function liquidateBorrow(address borrower, address collateral) external payable returns (uint);
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);
    function repayBorrowBehalf(address borrower) external payable;
    function redeem(uint redeemTokens) external returns (uint);
    function underlying() external view returns(address);
    function totalSupply() external view  returns (uint);
    function totalReserves() external view returns (uint);
}
struct Market {
    // @notice Whether or not this market is listed
    bool isListed;

    // @notice Multiplier representing the most one can borrow against their collateral in this market.
    // For instance, 0.9 to allow borrowing 90% of collateral value. Must be between 0 and 1, and stored as a mantissa.
    uint256 collateralFactorMantissa;

    // @notice Per-market mapping of "accounts in this asset"
    //mapping(address => bool) accountMembership;

    // @notice Whether or not this market receives WPC
    bool isMinted;
}

interface IComptroller {
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    function closeFactorMantissa() external view returns(uint);
    function getAllMarkets() external view returns (ICtoken[] memory);
    function accountAssets(address account,uint index) external view returns(ICtoken);
    function markets(address asset) external view returns(Market memory);
    function oracle() external view returns(IPriceOracle);
    function getAssetsIn(address account) external view returns (ICtoken[] memory);


}


contract CompoundDataProvider is Exponential{
    using SafeMath for uint;
    struct MarketData {
        address cToken;
        address underlyingAsset;
        uint totalSupplied;
        uint totalBorrowed;
        uint totalAvailable;
        uint assetPrice;
    }

    struct MarketUserData {
        address cToken;
        address underlyingAsset;
        uint amountSupplied;
        uint amountBorrowed;
        uint assetPrice;
        uint exchangeRateCurrent;
        bool usageAsCollateralEnabled;
    }

    struct UserData {
        address user;
        uint healthFactor;
        uint shortFall;
        uint liquidity;
        MarketUserData[] markets;
    }
    


    struct UserAccountData {
        ICtoken[] cTokens;
        uint[] collateralBalances;
        uint[] borrowBalances;
        uint[] assetPrices;
        uint shortFall;
        uint liquidity;
        uint healthFactor;
        address account;
    }

    struct AccountLiquidityLocalVars {
        uint sumCollateral;
        uint sumBorrowPlusEffects;
        uint pTokenBalance;
        uint borrowBalances;
        uint exchangeRateMantissa;
        uint oraclePriceMantissa;
        Exp collateralFactor;
        Exp exchangeRate;
        Exp oraclePrice;
        Exp tokensToDenom;
    }

    struct CalculateArgs{
        AccountLiquidityLocalVars vars;
        ICtoken asset;
        uint oraclePrice;
        IComptroller comptroller;
        address account;
        uint collateralBalances;
        uint borrowBalances;
        uint i;
    }

    function getMarkets(
        IComptroller comptroller,
        IPriceOracle priceFeed,
        address WETH
        
    ) public returns (MarketData[] memory markets) {
        
        ICtoken[] memory ctokens = comptroller.getAllMarkets();
        markets = new MarketData[](ctokens.length);
        
        for (uint i = 0 ; i < ctokens.length; i++) {
            ICtoken cToken = ctokens[i];
            address underlyingAsset;
            uint underlyingDecimals;
            uint totalAvailable;
            try cToken.underlying() returns (address _underlyingAsset) {
                underlyingAsset = _underlyingAsset;
                totalAvailable = IERC20(underlyingAsset).balanceOf(address(cToken));
            } catch {
                //weth
                underlyingAsset = WETH;
                totalAvailable = address(cToken).balance;
            }
            
            uint totalBorrowed = cToken.totalBorrows();
            uint totalSupplied = totalAvailable.add(totalBorrowed);
            uint price =    priceFeed.getUnderlyingPrice(cToken);          
            
            markets[i] = MarketData({
                cToken: address(cToken),
                underlyingAsset: underlyingAsset,
                totalSupplied: totalSupplied,
                totalBorrowed: totalBorrowed,
                totalAvailable: totalAvailable,
                assetPrice: price
            });
        }
    }



    function getUserData(
        IComptroller comptroller,
        IPriceOracle priceFeed,
        address WETH,
        address user
    ) public returns (UserData memory) {
        UserAccountData memory data = getAccountLiquidity(Data_({
                comptroller: comptroller,
                account: user
        }));

        MarketUserData[] memory markets = new MarketUserData[](data.cTokens.length);
        ICtoken[] memory marketsEntered = comptroller.getAssetsIn(user);

        for (uint i = 0; i < data.collateralBalances.length; i++) {
            ICtoken cToken = data.cTokens[i];
            address underlyingAsset;
    
            try cToken.underlying() returns (address _underlyingAsset) {
                underlyingAsset = _underlyingAsset;
            } catch {
                //weth
                underlyingAsset = WETH;
            }

            uint amountSupplied = data.collateralBalances[i];
            uint amountBorrowed = data.borrowBalances[i];
            uint price =   data.assetPrices[i];
            uint exchangeRateCurrent =  cToken.exchangeRateCurrent();  //(cToken.getCash() + cToken.totalBorrows() - cToken.totalReserves() )/ cToken.totalSupply();
            bool usageAsCollateralEnabled = false;

            for (uint i = 0; i < marketsEntered.length; i++) {
                if (marketsEntered[i] == cToken) 
                    usageAsCollateralEnabled = true;
            }
            
            markets[i] = MarketUserData({
                cToken: address(cToken),
                underlyingAsset: underlyingAsset,
                amountSupplied: amountSupplied,
                amountBorrowed: amountBorrowed,
                assetPrice: price,
                exchangeRateCurrent: exchangeRateCurrent,
                usageAsCollateralEnabled: usageAsCollateralEnabled
            });
        }
        
        return UserData({
            user: user,
            healthFactor: data.healthFactor,
            liquidity: data.liquidity,
            shortFall: data.shortFall,
            markets: markets
        });
    }
    
    struct Data_ {
        IComptroller comptroller;
        address account;
    }
    function getAccountLiquidity(
        Data_ memory args
    ) public view returns (UserAccountData memory ) {
        AccountLiquidityLocalVars memory vars;
        ICtoken [] memory assets = getAllMarkets(args.comptroller);
        uint lenAsset = assets.length;
        uint[] memory collateralBalances = new uint[](lenAsset);
        uint[] memory borrowBalances = new uint[](lenAsset);
        uint[] memory assetPrices = new uint[](lenAsset);

        for (uint i = 0; i < lenAsset; i++) {
            ICtoken asset = assets[i];
            uint oraclePrice = args.comptroller.oracle().getUnderlyingPrice(asset);
            
            ReturnData memory _args = calculateShits(
               CalculateArgs({
                vars : vars,
                asset : asset,
                oraclePrice: oraclePrice,
                comptroller : args.comptroller,
                account : args.account,
                collateralBalances: collateralBalances[i],
                borrowBalances: borrowBalances[i],
                i:i
                })
            );

            vars = _args.vars;
            collateralBalances[i] = _args.collateralBalances;
            borrowBalances[i] = _args.borrowBalances;
            assetPrices[i] = oraclePrice;
        }
        
        uint healthFactor = 0;

         if (vars.sumCollateral > 0) {
             if (vars.sumBorrowPlusEffects > 0 ) {
                 healthFactor = vars.sumCollateral.mul(10**18).div(vars.sumBorrowPlusEffects);
             } else {
                 healthFactor = vars.sumCollateral.mul(10**18);
             }
         } else {
             healthFactor = 1 * 10 ** 32;
         }
        if (vars.sumCollateral > vars.sumBorrowPlusEffects) {
            return (UserAccountData({
                cTokens: assets,
                collateralBalances : collateralBalances,
                borrowBalances : borrowBalances,
                assetPrices: assetPrices,
                shortFall : 0,
                liquidity: vars.sumCollateral - vars.sumBorrowPlusEffects,
                healthFactor: healthFactor,
                account : args.account
            }));
        } else {
            uint shortFall = vars.sumBorrowPlusEffects - vars.sumCollateral;
            return (UserAccountData({
                cTokens: assets,
                collateralBalances : collateralBalances,
                borrowBalances : borrowBalances,
                assetPrices: assetPrices,
                shortFall : shortFall,
                liquidity: 0,
                healthFactor: healthFactor,
                account : args.account
            }));
        }
        
    }
   


    struct ReturnData{
        AccountLiquidityLocalVars vars;
        uint collateralBalances;
        uint borrowBalances;
    }

    function calculateShits(
        CalculateArgs memory args
    ) internal view returns(ReturnData memory){
        uint redeemTokens = 0;
        uint borrowAmount = 0;
        uint oErr;
        MathError mErr;
        ICtoken pTokenModify = ICtoken(address(0));

        (oErr, args.vars.pTokenBalance, args.vars.borrowBalances, args.vars.exchangeRateMantissa) = args.asset.getAccountSnapshot(args.account);
        
        Market memory market = args.comptroller.markets(address(args.asset));

        args.vars.collateralFactor = Exp({mantissa : market.collateralFactorMantissa});
        args.vars.exchangeRate = Exp({mantissa : args.vars.exchangeRateMantissa});

        // Get the normalized price of the asset
        args.vars.oraclePriceMantissa = args.oraclePrice;
        
        args.vars.oraclePrice = Exp({mantissa : args.vars.oraclePriceMantissa});

        // Pre-compute a conversion factor from tokens -> usd (normalized price value)
        // pTokenPrice = oraclePrice * exchangeRate
        (mErr, args.vars.tokensToDenom) = mulExp3(args.vars.collateralFactor, args.vars.exchangeRate, args.vars.oraclePrice);

        // sumCollateral += tokensToDenom * pTokenBalance
        (mErr, args.vars.sumCollateral) = mulScalarTruncateAddUInt(args.vars.tokensToDenom, args.vars.pTokenBalance, args.vars.sumCollateral);

        (mErr,args.collateralBalances) = mulScalarTruncate(args.vars.tokensToDenom,args.vars.pTokenBalance);
        //console.log("Collateral Balance:",args.collateralBalances[args.i]);
        // sumBorrowPlusEffects += oraclePrice * borrowBalances
        (mErr, args.vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(args.vars.oraclePrice, args.vars.borrowBalances, args.vars.sumBorrowPlusEffects);

        (mErr,args.borrowBalances) = mulScalarTruncate(args.vars.oraclePrice,args.vars.borrowBalances);

        //console.log("Borrow balance token:",args.borrowBalances[args.i]);

        if (args.asset == pTokenModify) {
            // redeem effect
            // sumBorrowPlusEffects += tokensToDenom * redeemTokens
            (mErr, args.vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(args.vars.tokensToDenom, redeemTokens, args.vars.sumBorrowPlusEffects);

            // borrow effect
            // sumBorrowPlusEffects += oraclePrice * borrowAmount
            (mErr, args.vars.sumBorrowPlusEffects) = mulScalarTruncateAddUInt(args.vars.oraclePrice, borrowAmount, args.vars.sumBorrowPlusEffects);

            //console.log("in pModify");
        }

        return (ReturnData({vars:args.vars,collateralBalances:args.vars.pTokenBalance,borrowBalances:args.vars.borrowBalances}));
    }


    function getAllMarkets(IComptroller comptroller) public view returns(ICtoken[] memory pTokens){
        pTokens = comptroller.getAllMarkets();
    }


}