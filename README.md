# Rain Orderbook Arbitrage Bot
NodeJS app that clears Rain orderbook orders against major DeFi platforms liquidity by finding arbitrage trades for token pairs of orders details queried from a subgraph or from file containing array of `Order Struct`, bundling them as `takeOrders` and submitting them to one of [Rain Arb Contracts](https://github.com/rainprotocol/rain.orderbook/tree/main/src/concrete).

This app requires NodeJS v18 or higher to run and is docker ready.
This app can also be run in Github Actions with a cron job, please read below for more details.

## The Case for Profitability
Profitablity can be adjusted by using an integer ≥0 for `--gas-coverage` as the percentage of the gas cost of the transaction, denominated in receiving ERC20 token, the cost of the transaction is calculated in the receiving ERC20 token unit with current market best price.

- If set to 100, the receiving profit must be at least equal or greater than gas cost.
- If set above 100, the receiving profit must be more than the amount of gas cost, for example a transaction costs 0.01 USDT (calculated from network's gas token i.e. ETH to receiving ERC20 token i.e. USDT or USDC or ...) and a value of 500 means the profit must be at least 5x the amount of gas used i.e. ≥0.05 USDT for the transaction to be successfull.
- If set to 0, profitablity becomes irrevelant meaning any match will be submitted irrespective of whether or not the transaction will be profitable. 

## Tutorial
### Setup
Start by cloning the repo and then:
- with nix package manager (recommended way):

first you need to run `./prep-sushi.sh` which would need nix package manager installed on your system:
```bash
./prep-sushi.sh
```
  next enter nix shell or just run from shell:
```bash
nix develop
```
  and then
```bash
npm install
```
  or
```bash
nix develop -c npm install
```

<br>
- without nix package manager:

you need to have pnpm `>= v8.15.3` and then run the following:
```bash
git submodule update --init --recursive
cd lib/sushiswap
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=./packages/sushi
```
and then install the dependencies, requires `>= nodejs v18`:
```bash
npm install
```
<br>

### CLI
For starting the app:
```bash
node arb-bot -k 12ab... -r https://... --orderbook-address 0x1a2b... --arb-address 0xab12... [other optional arguments]
```
The app requires these arguments (all arguments can be set in env variables alternatively, more details below):
- `-k` or `--key`, Private key of wallet that performs the transactions. Will override the 'BOT_WALLET_PRIVATEKEY' in env variables
- `-r` or `--rpc`, RPC URL(s) that will be provider for interacting with evm, use different providers if more than 1 is specified to prevent banning. Will override the 'RPC_URL' in env variables
- `--orderbook-address`, Address of the deployed orderbook contract, Will override the 'ORDERBOOK_ADDRESS' in env variables
- `--arb-address`, Address of the deployed arb contract, Will override the 'ARB_ADDRESS' in env variables

as well as at least one or both of below arguments:

- `-o` or `--orders`, The path to a local json file containing the orders details, can be used in combination with --subgraph, Will override the 'ORDERS' in env variables
 - `-s` or `--subgraph`, Subgraph URL(s) to read orders details from, can be used in combination with --orders, Will override the 'SUBGRAPH' in env variables

Other optional arguments are:
- `-l` or `--lps`, List of liquidity providers (dex) to use by the router as one quoted string seperated by a comma for each, example: 'SushiSwapV2,UniswapV3', Will override the 'LIQUIDITY_PROVIDERS' in env variables, if unset will use all available liquidty providers
- `-g` or `--gas-coverage`, The percentage of gas to cover to be considered profitable for the transaction to be submitted, an integer greater than equal 0, default is 100 meaning full coverage, Will override the 'GAS_COVER' in env variables
- `--repetitions`, Option to run `number` of times, if unset will run for infinte number of times
- `--order-hash`, Option to filter the subgraph query results with a specific order hash, Will override the 'ORDER_HASH' in env variables
- `--order-owner`, Option to filter the subgraph query results with a specific order owner address, Will override the 'ORDER_OWNER' in env variables
- `--order-interpreter`, Option to filter the subgraph query results with a specific order's interpreter address, Will override the 'ORDER_INTERPRETER' in env variables
- `--sleep`, Seconds to wait between each arb round, default is 10, Will override the 'SLEPP' in env variables
- `--max-ratio`, Option to maximize maxIORatio, Will override the 'MAX_RATIO' in env variables
- `--timeout`, Optional seconds to wait for the transaction to mine before disregarding it, Will override the 'TIMEOUT' in env variables
- `--flashbot-rpc`, Optional flashbot rpc url to submit transaction to, Will override the 'FLASHBOT_RPC' in env variables
- `--no-bundle`, Flag for not bundling orders based on pairs and clear each order individually. Will override the 'NO_BUNDLE' in env variables
- `--hops`, Option to specify how many hops the binary search should do, default is 11 if left unspecified, Will override the 'HOPS' in env variables
- `--retries`, Option to specify how many retries should be done for the same order, max value is 3, default is 1 if left unspecified, Will override the 'RETRIES' in env variables
- `--pool-update-interval`, Option to specify time (in minutes) between pools updates, default is 15 minutes, Will override the 'POOL_UPDATE_INTERVAL' in env variables
- `-V` or `--version`, output the version number
- `-h` or `--help`, output usage information

<br>

### List of available liquidity providers (decentralized exchanges)
- all of the below names are case INSENSITIVE:
`SushiSwapV2`,
`SushiSwapV3`,
`UniswapV2`,
`UniswapV3`,
`Trident`,
`QuickSwap`,
`ApeSwap`,
`PancakeSwapV2`,
`PancakeSwapV3`,
`TraderJoe`,
`Dfyn`,
`Elk`,
`JetSwap`,
`SpookySwapV2`,
`SpookySwapV3`,
`NetSwap`,
`NativeWrap`,
`HoneySwap`,
`UbeSwap`,
`Biswap`,
`CurveSwap`,
`DovishV3`,
`Wagmi`,
`LaserSwap`,
`BaseSwap`,
`AlgebraIntegral`,
`Solarbeam`,
`Swapsicle`,
`VVSStandard`,
`Fraxswap`,
`SwapBlast`,
`BlastDEX`,
`MonoswapV2`,
`MonoswapV3`,
`ThrusterV2`,
`ThrusterV3`,
`DyorV2`,
`HyperBlast`,
`KinetixV2`,
`KinetixV3`,
`Camelot`,
`Enosys`,
`BlazeSwap`,

<br>

CLI options can be viewed by running:
```bash
node arb-bot -h
```
<br>

Alternatively all variables can be specified in env variables with below keys:
```bash
# private key of the matchmaker bot's wallet
BOT_WALLET_PRIVATEKEY="123..."

# RPC URL(s) that will be provider for interacting with evm, use different providers if more than 1 is specified to prevent banning. 
# for specifying more than 1 RPC in the env, separate them by a comma and a space
RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/{API_KEY}, https://rpc.ankr.com/polygon/{API_KEY}"

# Option to submit transactions using the flashbot RPC. 
FLASHBOT_RPC=""

# arb contract address
ARB_ADDRESS="0x123..."

# orderbook contract address
ORDERBOOK_ADDRESS="0x123..."

# one or more subgraph urls to read orders details from, can be used in combination with ORDERS
# for more than 1 subgraphs, seperate them by comma and a space
SUBGRAPH="https://api.thegraph.com/subgraphs/name/org1/sg1, https://api.thegraph.com/subgraphs/name/org2/sg2"

# path to a .json file containing orders details, can be used in combination with SUBGRAPH 
# OR e.g. the path to the volume mounted by docker compose
ORDERS="/etc/rainprotocol/arb-bot/orders.json"

# list of liquidity providers names seperated by a comma for each
LIQUIDITY_PROVIDERS="sushiswapv2,uniswapv3,quickswap"

# gas coverage percentage for each transaction to be considered profitable to be submitted
GAS_COVER="100"

# an integer used for specifiying the number repetitions for the app to run, if not set will run for infinite number of times
REPETITIONS=1

# Option to filter the subgraph query results with a specific order hash
ORDER_HASH=""

# Option to filter the subgraph query results with a specific order owner address
ORDER_OWNER=""

# Option to filter the subgraph query results with a specific order interpreter address
ORDER_INTERPRETER=""

# Seconds to wait between each arb round, default is 10, Will override the 'SLEPP' in env variables
SLEEP=10

# Option to maximize maxIORatio
MAX_RATIO="true"

# Optional seconds to wait for the transaction to mine before disregarding it
TIMEOUT=""

# Flag for not bundling orders based on pairs and clear each order individually
NO_BUNDLE="false"

# number of hops of binary search, if left unspecified will be 11 by default
HOPS=11

# api key for heyperDx platfomr to send spans to, if not set will send traces to localhost
HYPERDX_API_KEY=""

# trace/spans service name, defaults to "arb-bot" if not set
TRACER_SERVICE_NAME=""

# The amount of retries for the same order, max is 3, default is 1
RETRIES=1

# Option to specify time (in minutes) between pools updates, default is 15 minutes
POOL_UPDATE_INTERVAL=
```
If both env variables and CLI argument are set, the CLI arguments will be prioritized and override the env variables.

If you install this app as a dependency for your project you can run it by (All the above arguments apply here as well):
```bash
arb-bot [arguments]
```
<br>

### API
The app can be executed through API:
```javascript
// to import
const RainArbBot = require("@rainprotocol/arb-bot");

// to run the app:
// options (all properties are optional)
const configOptions = {
  maxRatio              : true,    // option to maximize the maxIORatio
  flashbotRpc           : "https://flashbot-rpc-url",  // Optional Flashbot RPC URL
  timeout               : 300,     // seconds to wait for tx to mine before disregarding it  
  bundle                : true,    // if orders should be bundled based on token pair or be handled individually
  hops                  : 6,       // The amount of hops of binary search
  retries               : 1,       // The amount of retries for the same order
  liquidityProviders    : [        // list of liquidity providers to get quotes from (optional)
    "sushiswapv2",
    "uniswapv2"
  ],
  gasCoveragePercentage : "500"    // percentage of the transaction gas cost denominated in receiving ERC20 to be earned from the transaction in order for it to be successfull, as an example a value of 500 means atleast 5x the amount of transaction gas cost needs to be earned for the transaction to be successfull
}

// to get the configuration object
const config = await RainArbBot.getConfig(rpcUrl, walletPrivateKey, orderbookAddress, arbAddress, ...[configOptions]);

// to get the order details, one or both of subgraph and json file can be used simultaneously
const ordersJson    = "/home/orders.json"                                 // path to a local json file 
const subgraphs     = ["https://api.thegraph.com/subgraphs/name/xxx/yyy"] // array of subgraph URLs
const sgFilters     = {                                                   // filters for subgraph query (each filter is optional)
  orderHash         : "0x1234...",
  orderOwner        : "0x1234...",
  orderInterpreter  : "0x1234..."
}

// get the order details from the sources
const orderDetails = await RainArbBot.getOrderDetails(subgraphs, ordersJson, config.signer, sgFilters);

// to run the clearing process and get the report object which holds the report of cleared orders
const reports = await RainArbBot.clear(config, orderDetails)
```
<br>

## Running On Github Actions
In order to run this app periodically to clear orders in Github Actions, first you need to fork this repository, then you can modify the `./.github/workflows/take-orders.yaml` file with your desired configuration so the app run periodically. You can set the schedule for the app to run by modifying the cron syntax of the mentioned file and in the last line of the file, you can pass the required/optional arguments for the app to run. All the mentioned CLI arguments can be applied, for wallet private key and rpc url, you can set up Github Secrets.

Please be aware that schediled Github Actions can only be run at minimum once every 5 minutes and even that is not guarateed because it depends on Github resource availability at that time, so it is recommended to run the app on personal/reliable host if there is sensitivity with running on a schedule.

## Developers Guide
First run the [setup](#setup) section and then you can use following commands either from nix shell (`nix develop -c <COMMAND>`) or normally from your commandline.
To run the tests:
```bash
npm test
```
which runs on hardhat forked polygon network.

To lint or lint and fix:
```bash
npm run lint
```
```bash
npm run lint-fix
```

## Docker

Use docker compose if possible as it handles several things for you:

- Restart policy
- Rebuild policy
- Volume management
- Log rotation/policy
- Potentially other stuff like networking

### .env

Docker compose natively supports .env so configure it as per example.env and above.

Notably `DOCKER_CHANNEL` MUST be set to the git branch that you're currently on,
and you should be at the HEAD of said branch when attempting to interact with it.

This ensures that you'll download a docker image compatible with the current code
in your repository.

### Up & volumes

Run `docker compose up -d` to bring the container up. If this is the first time
you are doing this for the current channel you will likely see a complaint about
a missing volume.

You can create the volume however you want using `docker volume` but if you want
to map a specific path on the host to the volume mounted in the guest you'll need
to tell Docker to do so. The default behaviour of Docker is that it manages
volumes opaquely within its own system files, which has pros and cons. Either way
the default behaviour won't give you a predictable path on the host to work with.

To create a bind mount to a specific absolute path on the host

```
docker volume create --driver local --opt type=none --opt device=<absolute-host-path> --opt o=bind <volume-name>
```