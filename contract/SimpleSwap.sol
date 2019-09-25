pragma solidity ^0.5.0;

import "ERC1155Adapter-flat.sol";

contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previous_owner, address indexed new_owner);
    /**
     * @dev The Ownable constructor sets the original `owner` of the contract to the sender
     * account.
     */
    constructor() public {
        owner = msg.sender;
    }
    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }
    /**
    * @dev Allows the current owner to transfer control of the contract to a newOwner.
    * @param new_owner The address to transfer ownership to.
    */
    function transferOwnership(address new_owner) public onlyOwner {
        require(new_owner != address(0));
        emit OwnershipTransferred(owner, new_owner);
        owner = new_owner;
    }
}

contract ERC20 {
    function balanceOf(address) external view returns(uint256);
    function transfer(address to, uint256 amount) external returns(bool);
    function transferFrom(address from, address to, uint256 amount) external returns(bool);
}

interface ERC20NonStandard {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external;
}


contract SimpleSwap is ERC1155withAdapter, Ownable {
    event TokenPurchase(address indexed buyer, address indexed token, uint256 usdx_sold, uint256 tokens_bought);
    event USDXPurchase(address indexed buyer, address indexed token, uint256 tokens_sold, uint256 usdx_bought);
    event AddLiquidity(address indexed provider, address indexed token, uint256 usdx_amount, uint256 token_amount);
    event RemoveLiquidity(address indexed provider, address indexed token, uint256 usdx_amount, uint256 token_amount);

    mapping(address => uint256) public USDXReserveOf;
    uint256 public feeRate = 3000000000000000;
    address public USDX = address(0xdBCFff49D5F48DDf6e6df1f2C9B96E1FC0F31371);

    /***********************************|
    |        Manager Functions          |
    |__________________________________*/

    function setFee(uint256 new_fee) external onlyOwner{
        require(new_fee <= 30000000000000000); //fee must be smaller than 3%
        feeRate = new_fee;
    }

    function createAdapter(uint256 _id, string memory _name, string memory _symbol, uint8 _decimals) public onlyOwner {
        require(adapter[_id] == address(0));
        address a = createClone(template);
        ERC20Adapter(a).setup(_id, _name, _symbol, _decimals);
        adapter[_id] = a;
        emit NewAdapter(_id, a);
    }

    /***********************************|
    |        Exchange Functions         |
    |__________________________________*/

	/**
     * @dev Pricing function for converting between tokens.
     * @param input_amount Amount of Tokens being sold.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens bought.
     */
    function getInputPrice(uint256 input_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 input_amount_with_fee = input_amount.mul(1e18 - feeRate);
        uint256 numerator = input_amount_with_fee.mul(output_reserve);
        uint256 denominator = input_reserve.mul(1e18).add(input_amount_with_fee);
        return numerator / denominator;
    }

    /**
     * @dev Pricing function for converting between Tokens.
     * @param output_amount Amount of Tokens being bought.
     * @param input_reserve Amount of Tokens in exchange reserves.
     * @param output_reserve Amount of Tokens in exchange reserves.
     * @return Amount of Tokens sold.
     */
    function getOutputPrice(uint256 output_amount, uint256 input_reserve, uint256 output_reserve) public view returns (uint256) {
        require(input_reserve > 0 && output_reserve > 0);
        uint256 numerator = input_reserve.mul(output_amount).mul(1e18);
        uint256 denominator = (output_reserve.sub(output_amount)).mul(1e18 - feeRate);
        return (numerator / denominator).add(1);
    }


    function USDXToTokenInput(address token, uint256 USDX_sold, uint256 min_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && USDX_sold > 0 && min_tokens > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 tokens_bought = getInputPrice(USDX_sold, USDXReserveOf[token], token_reserve);
        USDXReserveOf[token] = USDXReserveOf[token].add(USDX_sold);

        require(tokens_bought >= min_tokens);
        require(doTransferIn(USDX, buyer, USDX_sold));
        require(doTransferOut(token, recipient, tokens_bought));

        emit TokenPurchase(buyer, token, USDX_sold, tokens_bought);
        return tokens_bought;
    }

    /**
     * @notice Convert USDX to tokens.
     * @dev User specifies exact USDX input && minium output.
     * @param token Address of Tokens bought.
     * @param USDX_sold Amount of USDX user wants to pay.
     * @param min_tokens Minium Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens bought.
     */
    function USDXToTokenSwapInput(address token, uint256 USDX_sold,  uint256 min_tokens, uint256 deadline) public returns (uint256) {
        return USDXToTokenInput(token, USDX_sold, min_tokens, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert USDX to Tokens && transfers Tokens to recipient.
     * @dev User specifies exact USDX input && minium output.
     * @param token Address of Tokens bought.
     * @param USDX_sold Amount of USDX user wants to pay.
     * @param min_tokens Minium Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The addresss that recieves output Tokens.
     * @return Amount of Token bought.
     */
    function USDXToTokenTransferInput(address token, uint256 USDX_sold, uint256 min_tokens, uint256 deadline, address recipient) public returns(uint256) {
        require(recipient != address(this) && recipient != address(0));
        return USDXToTokenInput(token, USDX_sold, min_tokens, deadline, msg.sender, recipient);
    }

    function USDXToTokenOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline, address  buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0 && max_USDX > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_sold = getOutputPrice(tokens_bought, USDXReserveOf[token], token_reserve);
        USDXReserveOf[token] = USDXReserveOf[token].add(USDX_sold);

        require(USDX_sold <= max_USDX);
        require(doTransferIn(USDX, buyer, USDX_sold));
        require(doTransferOut(token, recipient, tokens_bought));

        emit TokenPurchase(buyer, token, USDX_sold, tokens_bought);
        return USDX_sold;
    }

    /**
     * @notice Convert USDX to Tokens.
     * @dev User specifies maxium USDX input && exact output.
     * @param token Address of Tokens bought.
     * @param tokens_bought Amount of token bought.
     * @param max_USDX Maxium amount of USDX sold.
     * @param deadline Time after which this transaction can be no longer be executed.
     * @return Amount of USDX sold.
     */
    function USDXToTokenSwapOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline) public returns(uint256) {
        return USDXToTokenOutput(token, tokens_bought, max_USDX, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert USDX to Tokens && transfer Tokens to recipient.
     * @dev User specifies maxium USDX input && exact output.
     * @param token Address of Tokens bought.
     * @param tokens_bought Amount of token bought.
     * @param max_USDX Maxium amount of USDX sold.
     * @param deadline Time after which this transaction can be no longer be executed.
     * @param recipient The address the receives output Tokens.
     * @return Amount of USDX sold.
     */
    function USDXToTokenTransferOutput(address token, uint256 tokens_bought, uint256 max_USDX, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return USDXToTokenOutput(token, tokens_bought, max_USDX, deadline, msg.sender, recipient);
    }

    function tokenToUSDXInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_USDX > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_bought = getInputPrice(tokens_sold, token_reserve, USDXReserveOf[token]);
        USDXReserveOf[token] = USDXReserveOf[token].sub(USDX_bought);

        require(USDX_bought >= min_USDX);
        require(doTransferIn(token, buyer, tokens_sold));
        require(doTransferOut(USDX, recipient, USDX_bought));

        emit USDXPurchase(buyer, token, tokens_sold, USDX_bought);
        return USDX_bought;
    }

    /**
     * @notice Convert Tokens to USDX.
     * @dev User specifies exact input && minium output.
     * @param token Address of Tokens sold.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_USDX Minium USDX purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of USDX bought.
     */
    function tokenToUSDXSwapInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline) public returns (uint256) {
        return tokenToUSDXInput(token, tokens_sold, min_USDX, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to USDX && transfer USDX to recipient.
     * @dev User specifies exact input && minium output.
     * @param token The address of Tokens sold.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_USDX Minium USDX purchased.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output USDX.
     * @return Amount of USDX bought.
     */
    function tokenToUSDXTransferInput(address token, uint256 tokens_sold, uint256 min_USDX, uint256 deadline, address recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToUSDXInput(token, tokens_sold, min_USDX, deadline, msg.sender, recipient);
    }

    function tokenToUSDXOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline, address buyer, address recipient) private returns (uint256) {
        //check if such trading pair exists
        require(totalSupply[uint256(token)] > 0);
        require(deadline >= block.timestamp && USDX_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 tokens_sold = getOutputPrice(USDX_bought, token_reserve, USDXReserveOf[token]);
        USDXReserveOf[token] = USDXReserveOf[token].sub(USDX_bought);

        require(max_tokens >= tokens_sold);
        require(doTransferIn(token, buyer, tokens_sold));
        require(doTransferOut(USDX, recipient, USDX_bought));

        emit USDXPurchase(buyer, token, tokens_sold, USDX_bought);
        return tokens_sold;
    }

    /**
     * @notice Convert Tokens to USDX.
     * @dev User specifies maxium input && exact output.
     * @param token Address of Tokens sold.
     * @param USDX_bought Amount of USDX bought.
     * @param max_tokens Maxium Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens sold.
     */
    function tokenToUSDXSwapOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline) public returns (uint256) {
        return tokenToUSDXOutput(token, USDX_bought, max_tokens, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to USDX && transfers USDX to recipient.
     * @dev User specifies maxium input && exact output.
     * @param token Address of Tokens sold.
     * @param USDX_bought Amount of USDX bought.
     * @param max_tokens Maxium Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output USDX.
     * @return Amount of Tokens sold.
     */
    function tokenToUSDXTransferOutput(address token, uint256 USDX_bought, uint256 max_tokens, uint256 deadline, address  recipient) public returns (uint256) {
        require(recipient != address(this) && recipient != address(0));
        return tokenToUSDXOutput(token, USDX_bought, max_tokens, deadline, msg.sender, recipient);
    }

    function tokenToTokenInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline,
        address buyer,
        address recipient)
        private returns (uint256)
    {
        //check not self-swapping
        require(input_token != output_token);
        //check if such trading pair exists
        require(totalSupply[uint256(input_token)] > 0 && totalSupply[uint256(output_token)] > 0);
        require(deadline >= block.timestamp && tokens_sold > 0 && min_tokens_bought > 0);
        uint256 input_token_reserve = ERC20(input_token).balanceOf(address(this));
        uint256 USDX_bought = getInputPrice(tokens_sold, input_token_reserve, USDXReserveOf[input_token]);

        uint256 output_token_reserve = ERC20(output_token).balanceOf(address(this));
        uint256 token_bought = getInputPrice(USDX_bought, USDXReserveOf[output_token], output_token_reserve);

        // move USDX reserve
        USDXReserveOf[input_token] = USDXReserveOf[input_token].sub(USDX_bought);
        USDXReserveOf[output_token] = USDXReserveOf[output_token].add(USDX_bought);

        // do input/output token transfer
        require(min_tokens_bought <= token_bought);
        require(doTransferIn(input_token, buyer, tokens_sold));
        require(doTransferOut(output_token, recipient, token_bought));

        emit USDXPurchase(buyer, input_token, tokens_sold, USDX_bought);
        emit TokenPurchase(buyer, output_token, USDX_bought, token_bought);
        return token_bought;
    }

    /**
     * @notice Convert Tokens to Tokens.
     * @dev User specifies exact input && minium output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_tokens_bought Minium amount of Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens bought.
     */
    function tokenToTokenSwapInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline)
        public returns (uint256)
    {
        return tokenToTokenInput(input_token, output_token, tokens_sold,  min_tokens_bought, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to Tokens && transfers Tokens to recipient.
     * @dev User specifies exact input && minium output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_sold Amount of Tokens sold.
     * @param min_tokens_bought Minium amount of Tokens bought.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that recieves output token.
     * @return Amount of Tokens bought.
     */
    function tokenToTokenTransferInput(
        address input_token,
        address output_token,
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 deadline,
        address recipient)
        public returns (uint256)
    {
        return tokenToTokenInput(input_token, output_token, tokens_sold,  min_tokens_bought, deadline, msg.sender, recipient);
    }

    function tokenToTokenOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline,
        address buyer,
        address recipient)
        private returns (uint256)
    {
        //check not self-swapping
        require(input_token != output_token);
        //check if such trading pair exists
        require(totalSupply[uint256(input_token)] > 0 && totalSupply[uint256(output_token)] > 0);
        require(deadline >= block.timestamp && tokens_bought > 0);
        uint256 output_token_reserve = ERC20(output_token).balanceOf(address(this));
        uint256 USDX_bought = getOutputPrice(tokens_bought, USDXReserveOf[output_token], output_token_reserve);

        uint256 tokens_sold;
        tokens_sold = tokenToTokenOutputHelper(input_token,USDX_bought);

        // move USDX reserve
        USDXReserveOf[input_token] = USDXReserveOf[input_token].sub(USDX_bought);
        USDXReserveOf[output_token] = USDXReserveOf[output_token].add(USDX_bought);

        require(max_tokens_sold >= tokens_sold);
        require(doTransferIn(input_token, buyer, tokens_sold));
        require(doTransferOut(output_token, recipient, tokens_bought));

        emit USDXPurchase(buyer, input_token, tokens_sold, USDX_bought);
        emit TokenPurchase(buyer, output_token, USDX_bought, tokens_bought);
        return tokens_sold;
    }

    function tokenToTokenOutputHelper(address input_token, uint256 USDX_bought) private view returns(uint256) {
        uint256 input_token_reserve = ERC20(input_token).balanceOf(address(this));
        uint256 tokens_sold = getOutputPrice(USDX_bought, input_token_reserve, USDXReserveOf[input_token]);
        return  tokens_sold;
    }

    /**
     * @notice Convert Tokens to Tokens.
     * @dev User specifies maxium input && exact output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_bought Amount of Tokens bought.
     * @param max_tokens_sold Maxium amount of Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amount of Tokens sold.
     */
    function tokenToTokenSwapOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline)
        public returns (uint256)
    {
        return tokenToTokenOutput(input_token, output_token, tokens_bought, max_tokens_sold, deadline, msg.sender, msg.sender);
    }

    /**
     * @notice Convert Tokens to Tokens && transfers Tokens to recipient.
     * @dev User specifies maxium input && exact output.
     * @param input_token Address of Tokens sold.
     * @param output_token Address of Tokens bought.
     * @param tokens_bought Amount of Tokens bought.
     * @param max_tokens_sold Maxium amount of Tokens sold.
     * @param deadline Time after which this transaction can no longer be executed.
     * @param recipient The address that receives output Tokens.
     * @return Amount of Tokens sold.
     */
    function tokenToTokenTransferOutput(
        address input_token,
        address output_token,
        uint256 tokens_bought,
        uint256 max_tokens_sold,
        uint256 deadline,
        address recipient)
        public returns (uint256)
    {

        return tokenToTokenOutput(input_token, output_token, tokens_bought, max_tokens_sold, deadline, msg.sender, recipient);
    }


    /***********************************|
    |         Getter Functions          |
    |__________________________________*/

    /**
     * @notice Public price function for USDX to Token trades with an exact input.
     * @param token address of token to buy.
     * @param usdx_sold Amount of ETH sold.
     * @return Amount of Tokens that can be bought with input USDX.
     */
    function getUSDXToTokenInputPrice(address token, uint256 usdx_sold) public view returns (uint256) {
        require(usdx_sold > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getInputPrice(usdx_sold, USDXReserveOf[token], token_reserve);
    }

    /**
     * @notice Public price function for USDX to Token trades with an exact output.
     * @param token address of token to buy.
     * @param tokens_bought Amount of Tokens bought.
     * @return Amount of USDX needed to buy output Tokens.
     */
    function getUSDXToTokenOutputPrice(address token, uint256 tokens_bought) public view returns (uint256) {
        require(tokens_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getOutputPrice(tokens_bought, USDXReserveOf[token], token_reserve);
    }

    /**
     * @notice Public price function for Token to USDX trades with an exact input.
     * @param token address of token to sell.
     * @param tokens_sold Amount of Tokens sold.
     * @return Amount of USDX that can be bought with input Tokens.
     */
    function getTokenToUSDXInputPrice(address token, uint256 tokens_sold) public view returns (uint256) {
        require(tokens_sold > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getInputPrice(tokens_sold, token_reserve, USDXReserveOf[token]);
    }

    /**
     * @notice Public price function for Token to ETH trades with an exact output.
     * @param token address of token to sell.
     * @param usdx_bought Amount of output ETH.
     * @return Amount of Tokens needed to buy output ETH.
     */
    function getTokenToUSDXOutputPrice(address token, uint256 usdx_bought) public view returns (uint256) {
        require(usdx_bought > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        return getOutputPrice(usdx_bought, token_reserve, USDXReserveOf[token]);
    }



    /***********************************|
    |        Liquidity Functions        |
    |__________________________________*/

    /**
     * @notice Deposit USDX && Tokens at current ratio to mint liquidity tokens.
     * @dev min_liquidity does nothing when total liquidity supply is 0.
     * @param token Address of Tokens reserved
     * @param reserve_added Amount of USDX reserved
     * @param min_liquidity Minium number of liquidity sender will mint if total liquidity supply is greater than 0.
     * @param max_tokens Maxium number of tokens deposited. Deposits max amount if total liquidity supply is 0.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return Amoutn of Liquidity minted
     */
    function addLiquidity(address token, uint256 reserve_added, uint256 min_liquidity, uint256 max_tokens, uint256 deadline) public payable returns (uint256) {
        require(deadline >= block.timestamp && max_tokens > 0 && reserve_added > 0);
        uint256 total_liquidity = totalSupply[uint256(token)];

        if (total_liquidity > 0) {
            require(min_liquidity > 0);
            uint256 token_reserve = ERC20(token).balanceOf(address(this));
            uint256 token_amount = (reserve_added.mul(token_reserve) / USDXReserveOf[token]).add(1);
            uint256 liquidity_minted = reserve_added.mul(total_liquidity) / USDXReserveOf[token];
            require(max_tokens >= token_amount && liquidity_minted >= min_liquidity);
            balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].add(liquidity_minted);
            totalSupply[uint256(token)] = total_liquidity.add(liquidity_minted);
            USDXReserveOf[token] = USDXReserveOf[token].add(reserve_added);

            require(doTransferIn(token, msg.sender, token_amount));
            require(doTransferIn(USDX, msg.sender, reserve_added));

            emit AddLiquidity(msg.sender, token, reserve_added, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), liquidity_minted);
            return liquidity_minted;

        } else {
            require(reserve_added >= 1000000000);
            uint256 token_amount = max_tokens;
            uint256 initial_liquidity = reserve_added;

            totalSupply[uint256(token)] = initial_liquidity;
            balances[uint256(token)][msg.sender] = initial_liquidity;
            USDXReserveOf[token] = USDXReserveOf[token].add(reserve_added);

            require(doTransferIn(token, msg.sender, token_amount));
            require(doTransferIn(USDX, msg.sender, reserve_added));

            emit AddLiquidity(msg.sender, token, reserve_added, token_amount);
            emit TransferSingle(msg.sender, address(0), msg.sender, uint256(token), initial_liquidity);
            return initial_liquidity;
        }
    }

    /**
     * @notice Withdraw USDX && Tokens at current ratio to burn liquidity tokens.
     * @dev Burn liquidity tokens to withdraw USDX && Tokens at current ratio.
     * @param token Address of Tokens withdrawn.
     * @param amount Amount of liquidity burned.
     * @param min_USDX Minium USDX withdrawn.
     * @param min_tokens Minium Tokens withdrawn.
     * @param deadline Time after which this transaction can no longer be executed.
     * @return The amount of USDX && Tokens withdrawn.
     */
    function removeLiquidity(address token, uint256 amount, uint256 min_USDX, uint256 min_tokens, uint256 deadline) public returns (uint256, uint256) {
        require(amount > 0 && deadline >= block.timestamp && min_USDX > 0 && min_tokens > 0);
        uint256 total_liquidity = totalSupply[uint256(token)];
        require(total_liquidity > 0);
        uint256 token_reserve = ERC20(token).balanceOf(address(this));
        uint256 USDX_amount = amount.mul(USDXReserveOf[token]) / total_liquidity;
        uint256 token_amount = amount.mul(token_reserve) / total_liquidity;
        require(USDX_amount >= min_USDX && token_amount >= min_tokens);

        balances[uint256(token)][msg.sender] = balances[uint256(token)][msg.sender].sub(amount);
        totalSupply[uint256(token)] = total_liquidity.sub(amount);
        USDXReserveOf[token] = USDXReserveOf[token].sub(USDX_amount);

        require(doTransferOut(token, msg.sender, token_amount));
        require(doTransferOut(USDX, msg.sender, USDX_amount));

        emit RemoveLiquidity(msg.sender, token, USDX_amount, token_amount);
        emit TransferSingle(msg.sender, msg.sender, address(0), uint256(token), amount);
        return (USDX_amount, token_amount);
    }

    /***********************************|
    |         SAFE Token Transfer       |
    |__________________________________*/

    function doTransferIn(address tokenAddr, address from, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transferFrom(from, address(this), amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }

    }

    function doTransferOut(address tokenAddr, address to, uint amount) internal returns (bool result) {
        ERC20NonStandard token = ERC20NonStandard(tokenAddr);
        token.transfer(to, amount);

        assembly {
            switch returndatasize()
                case 0 {                      // This is a non-standard ERC-20
                    result := not(0)          // set result to true
                }
                case 32 {                     // This is a complaint ERC-20
                    returndatacopy(0, 0, 32)
                    result := mload(0)        // Set `result = returndata` of external call
                }
                default {                     // This is an excessively non-compliant ERC-20, revert.
                    revert(0, 0)
                }
        }

    }

}