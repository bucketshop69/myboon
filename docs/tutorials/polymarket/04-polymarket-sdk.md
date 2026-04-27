> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Quickstart

> Fetch a market and place your first order

Get up and running with the Polymarket API in minutes — fetch market data and place your first order.

<Steps>
  <Step title="Fetch a Market">
    All data endpoints are public — no API key or authentication needed. Use the markets endpoint to find a market and get its token IDs:

    <Tabs>
      <Tab title="cURL">
        ```bash  theme={null}
        curl "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1"
        ```
      </Tab>

      <Tab title="TypeScript">
        ```typescript  theme={null}
        const response = await fetch(
          "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1"
        );
        const markets = await response.json();

        const market = markets[0];
        console.log(market.question);
        console.log(market.clobTokenIds);
        // ["123456...", "789012..."]  — [Yes token ID, No token ID]
        ```
      </Tab>

      <Tab title="Python">
        ```python  theme={null}
        import requests

        response = requests.get(
            "https://gamma-api.polymarket.com/markets",
            params={"active": "true", "closed": "false", "limit": 1}
        )
        markets = response.json()

        market = markets[0]
        print(market["question"])
        print(market["clobTokenIds"])
        # ["123456...", "789012..."]  — [Yes token ID, No token ID]
        ```
      </Tab>
    </Tabs>

    Save a token ID from `clobTokenIds` — you'll need it to place an order. The first ID is the Yes token, the second is the No token. See [Fetching Markets](/market-data/fetching-markets) for more strategies like fetching by slug, tag, or event.
  </Step>

  <Step title="Install the SDK">
    <CodeGroup>
      ```bash TypeScript theme={null}
      npm install @polymarket/clob-client ethers@5
      ```

      ```bash Python theme={null}
      pip install py-clob-client
      ```
    </CodeGroup>
  </Step>

  <Step title="Set Up Your Client">
    Derive API credentials and initialize the trading client:

    <Tabs>
      <Tab title="TypeScript">
        ```typescript  theme={null}
        import { ClobClient } from "@polymarket/clob-client";
        import { Wallet } from "ethers"; // v5.8.0

        const HOST = "https://clob.polymarket.com";
        const CHAIN_ID = 137; // Polygon mainnet
        const signer = new Wallet(process.env.PRIVATE_KEY);

        // Derive API credentials (L1 → L2 auth)
        const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
        const apiCreds = await tempClient.createOrDeriveApiKey();

        // Initialize trading client
        const client = new ClobClient(
          HOST,
          CHAIN_ID,
          signer,
          apiCreds,
          0, // Signature type: 0 = EOA
          signer.address, // Funder address
        );
        ```
      </Tab>

      <Tab title="Python">
        ```python  theme={null}
        from py_clob_client.client import ClobClient
        import os

        host = "https://clob.polymarket.com"
        chain_id = 137  # Polygon mainnet
        private_key = os.getenv("PRIVATE_KEY")

        # Derive API credentials (L1 → L2 auth)
        temp_client = ClobClient(host, key=private_key, chain_id=chain_id)
        api_creds = temp_client.create_or_derive_api_creds()

        # Initialize trading client
        client = ClobClient(
            host,
            key=private_key,
            chain_id=chain_id,
            creds=api_creds,
            signature_type=0,  # Signature type: 0 = EOA
            funder="YOUR_WALLET_ADDRESS",  # Funder address
        )
        ```
      </Tab>
    </Tabs>

    <Note>
      This example uses an EOA wallet (signature type `0`) — your wallet pays its
      own gas. Proxy wallet users (types `1` and `2`) can use Polymarket's gasless
      relayer instead. See [Authentication](/api-reference/authentication) for
      details on signature types.
    </Note>

    <Warning>
      Before trading, your funder address needs **USDC.e** (for buying outcome
      tokens) and **POL** (for gas, if using EOA type `0`).
    </Warning>
  </Step>

  <Step title="Place an Order">
    Use the `token_id` from Step 1 to place a limit order:

    <Tabs>
      <Tab title="TypeScript">
        ```typescript  theme={null}
        import { Side, OrderType } from "@polymarket/clob-client";

        // Fetch market details to get tick size and neg risk
        const market = await client.getMarket("YOUR_CONDITION_ID");
        const tickSize = String(market.minimum_tick_size);   // e.g., "0.01"
        const negRisk = market.neg_risk;             // e.g., false

        const response = await client.createAndPostOrder(
          {
            tokenID: "YOUR_TOKEN_ID", // From Step 1
            price: 0.50,
            size: 10,
            side: Side.BUY,
            orderType: OrderType.GTC,
          },
          {
            tickSize,
            negRisk,
          },
        );

        console.log("Order ID:", response.orderID);
        console.log("Status:", response.status);
        ```
      </Tab>

      <Tab title="Python">
        ```python  theme={null}
        from py_clob_client.clob_types import OrderArgs, OrderType
        from py_clob_client.order_builder.constants import BUY

        # Fetch market details to get tick size and neg risk
        market = client.get_market("YOUR_CONDITION_ID")
        tick_size = str(market["minimum_tick_size"])   # e.g., "0.01"
        neg_risk = market["neg_risk"]             # e.g., False

        response = client.create_and_post_order(
            OrderArgs(
                token_id="YOUR_TOKEN_ID",  # From Step 1
                price=0.50,
                size=10,
                side=BUY,
                order_type=OrderType.GTC,
            ),
            options={
                "tick_size": tick_size,
                "neg_risk": neg_risk,
            },
        )

        print("Order ID:", response["orderID"])
        print("Status:", response["status"])
        ```
      </Tab>
    </Tabs>
  </Step>
</Steps>

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Authentication" icon="lock" href="/api-reference/authentication">
    Understand L1/L2 auth, signature types, and API credentials.
  </Card>

  <Card title="Trading Quickstart" icon="bolt" href="/trading/quickstart">
    Detailed trading guide with order management and troubleshooting.
  </Card>

  <Card title="Fetching Markets" icon="magnifying-glass" href="/market-data/fetching-markets">
    Strategies for discovering markets by slug, tag, or category.
  </Card>

  <Card title="Core Concepts" icon="book" href="/concepts/markets-events">
    Understand markets, events, prices, and positions.
  </Card>
</CardGroup>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://docs.polymarket.com/llms.txt>
> Use this file to discover all available pages before exploring further.

# Authentication

> How to authenticate requests to the CLOB API

The CLOB API uses two levels of authentication: **L1 (Private Key)** and **L2 (API Key)**. Either can be accomplished using the CLOB client or REST API.

## Public vs Authenticated

<CardGroup cols={1}>
  <Card title="Public (No Auth)" icon="unlock">
    The **Gamma API**, **Data API**, and CLOB read endpoints (orderbook, prices, spreads) require no authentication.
  </Card>

  <Card title="Authenticated (CLOB)" icon="lock">
    CLOB trading endpoints (placing orders, cancellations, heartbeat) require all 5 `POLY_*` L2 HTTP headers.
  </Card>
</CardGroup>

***

## Two-Level Authentication Model

The CLOB uses two levels of authentication: L1 (Private Key) and L2 (API Key). Either can be accomplished using the CLOB client or REST API

### L1 Authentication

L1 authentication uses the wallet's private key to sign an EIP-712 message used in the request header. It proves ownership and control over the private key. The private key stays in control of the user and all trading activity remains non-custodial.

**Used for:**

* Creating API credentials
* Deriving existing API credentials
* Signing and creating user's orders locally

### L2 Authentication

L2 uses API credentials (apiKey, secret, passphrase) generated from L1 authentication. These are used solely to authenticate requests made to the CLOB API. Requests are signed using HMAC-SHA256.

**Used for:**

* Cancel or get user's open orders
* Check user's balances and allowances
* Post user's signed orders

<Info>
  Even with L2 authentication headers, methods that create user orders still
  require the user to sign the order payload.
</Info>

***

## Getting API Credentials

Before making authenticated requests, you need to obtain API credentials using L1 authentication.

### Using the SDK

<Tabs>
  <Tab title="TypeScript">
    ```typescript  theme={null}
    import { ClobClient } from "@polymarket/clob-client";
    import { Wallet } from "ethers"; // v5.8.0

    const client = new ClobClient(
      "https://clob.polymarket.com",
      137, // Polygon mainnet
      new Wallet(process.env.PRIVATE_KEY)
    );

    // Creates new credentials or derives existing ones
    const credentials = await client.createOrDeriveApiKey();

    console.log(credentials);
    // {
    //   apiKey: "550e8400-e29b-41d4-a716-446655440000",
    //   secret: "base64EncodedSecretString",
    //   passphrase: "randomPassphraseString"
    // }
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    from py_clob_client.client import ClobClient
    import os

    client = ClobClient(
        host="https://clob.polymarket.com",
        chain_id=137,  # Polygon mainnet
        key=os.getenv("PRIVATE_KEY")
    )

    # Creates new credentials or derives existing ones
    credentials = client.create_or_derive_api_creds()

    print(credentials)
    # {
    #     "apiKey": "550e8400-e29b-41d4-a716-446655440000",
    #     "secret": "base64EncodedSecretString",
    #     "passphrase": "randomPassphraseString"
    # }
    ```
  </Tab>
</Tabs>

<Warning>
  **Never commit private keys to version control.** Always use environment
  variables or secure key management systems.
</Warning>

### Using the REST API

While we highly recommend using our provided clients to handle signing and authentication, the following is for developers who choose NOT to use our [Python](https://github.com/Polymarket/py-clob-client) or [TypeScript](https://github.com/Polymarket/clob-client) clients.

**Create API Credentials**

```bash  theme={null}
POST https://clob.polymarket.com/auth/api-key
```

**Derive API Credentials**

```bash  theme={null}
GET https://clob.polymarket.com/auth/derive-api-key
```

Required L1 headers:

| Header           | Description            |
| ---------------- | ---------------------- |
| `POLY_ADDRESS`   | Polygon signer address |
| `POLY_SIGNATURE` | CLOB EIP-712 signature |
| `POLY_TIMESTAMP` | Current UNIX timestamp |
| `POLY_NONCE`     | Nonce (default: 0)     |

The `POLY_SIGNATURE` is generated by signing the following EIP-712 struct:

<Accordion title="EIP-712 Signing Example">
  <CodeGroup>
    ```typescript TypeScript theme={null}
    const domain = {
      name: "ClobAuthDomain",
      version: "1",
      chainId: chainId, // Polygon Chain ID 137
    };

    const types = {
      ClobAuth: [
        { name: "address", type: "address" },
        { name: "timestamp", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "message", type: "string" },
      ],
    };

    const value = {
      address: signingAddress, // The Signing address
      timestamp: ts,            // The CLOB API server timestamp
      nonce: nonce,             // The nonce used
      message: "This message attests that I control the given wallet",
    };

    const sig = await signer._signTypedData(domain, types, value);
    ```

    ```python Python theme={null}
    domain = {
        "name": "ClobAuthDomain",
        "version": "1",
        "chainId": chainId,  # Polygon Chain ID 137
    }

    types = {
        "ClobAuth": [
            {"name": "address", "type": "address"},
            {"name": "timestamp", "type": "string"},
            {"name": "nonce", "type": "uint256"},
            {"name": "message", "type": "string"},
        ]
    }

    value = {
        "address": signingAddress,  # The signing address
        "timestamp": ts,            # The CLOB API server timestamp
        "nonce": nonce,             # The nonce used
        "message": "This message attests that I control the given wallet",
    }

    sig = signer.sign_typed_data(domain, types, value)
    ```
  </CodeGroup>
</Accordion>

Reference implementations:

* [TypeScript](https://github.com/Polymarket/clob-client/blob/main/src/signing/eip712.ts)
* [Python](https://github.com/Polymarket/py-clob-client/blob/main/py_clob_client/signing/eip712.py)

Response:

```json  theme={null}
{
  "apiKey": "550e8400-e29b-41d4-a716-446655440000",
  "secret": "base64EncodedSecretString",
  "passphrase": "randomPassphraseString"
}
```

**You'll need all three values for L2 authentication.**

***

## L2 Authentication Headers

All trading endpoints require these 5 headers:

| Header            | Description                   |
| ----------------- | ----------------------------- |
| `POLY_ADDRESS`    | Polygon signer address        |
| `POLY_SIGNATURE`  | HMAC signature for request    |
| `POLY_TIMESTAMP`  | Current UNIX timestamp        |
| `POLY_API_KEY`    | User's API `apiKey` value     |
| `POLY_PASSPHRASE` | User's API `passphrase` value |

The `POLY_SIGNATURE` for L2 is an HMAC-SHA256 signature created using the user's API credentials `secret` value. Reference implementations can be found in the [TypeScript](https://github.com/Polymarket/clob-client/blob/main/src/signing/hmac.ts) and [Python](https://github.com/Polymarket/py-clob-client/blob/main/py_clob_client/signing/hmac.py) clients.

### CLOB Client

<Tabs>
  <Tab title="TypeScript">
    ```typescript  theme={null}
    import { ClobClient } from "@polymarket/clob-client";
    import { Wallet } from "ethers"; // v5.8.0

    const client = new ClobClient(
      "https://clob.polymarket.com",
      137,
      new Wallet(process.env.PRIVATE_KEY),
      apiCreds, // Generated from L1 auth, API credentials enable L2 methods
      1, // signatureType explained below
      funderAddress // funder explained below
    );

    // Now you can trade!
    const order = await client.createAndPostOrder(
      { tokenID: "123456", price: 0.65, size: 100, side: "BUY" },
      { tickSize: "0.01", negRisk: false }
    );
    ```
  </Tab>

  <Tab title="Python">
    ```python  theme={null}
    from py_clob_client.client import ClobClient
    import os

    client = ClobClient(
        host="https://clob.polymarket.com",
        chain_id=137,
        key=os.getenv("PRIVATE_KEY"),
        creds=api_creds,  # Generated from L1 auth, API credentials enable L2 methods
        signature_type=1,  # signatureType explained below
        funder=os.getenv("FUNDER_ADDRESS") # funder explained below
    )

    # Now you can trade!
    order = client.create_and_post_order(
        {"token_id": "123456", "price": 0.65, "size": 100, "side": "BUY"},
        {"tick_size": "0.01", "neg_risk": False}
    )
    ```
  </Tab>
</Tabs>

<Info>
  Even with L2 authentication headers, methods that create user orders still
  require the user to sign the order payload.
</Info>

***

## Signature Types and Funder

When initializing the L2 client, you must specify your wallet **signatureType** and the **funder** address which holds the funds:

| Signature Type | Value | Description                                                                                                                                                                                  |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EOA            | `0`   | Standard Ethereum wallet (MetaMask). Funder is the EOA address and will need POL to pay gas on transactions.                                                                                 |
| POLY\_PROXY    | `1`   | A custom proxy wallet only used with users who logged in via Magic Link email/Google. Using this requires the user to have exported their PK from Polymarket.com and imported into your app. |
| GNOSIS\_SAFE   | `2`   | Gnosis Safe multisig proxy wallet (most common). Use this for any new or returning user who does not fit the other 2 types.                                                                  |

<Tip>
  The wallet address displayed to the user on Polymarket.com is the proxy wallet
  and should be used as the funder. These can be deterministically derived or
  you can deploy them on behalf of the user. These proxy wallets are
  automatically deployed for the user on their first login to Polymarket.com.
</Tip>

***

## Security Best Practices

<AccordionGroup>
  <Accordion title="Never expose private keys">
    Store private keys in environment variables or secure key management systems. Never commit them to version control.

    ```bash  theme={null}
    # .env (never commit this file)
    PRIVATE_KEY=0x...
    ```
  </Accordion>

  <Accordion title="Implement request signing on the server">
    Never expose your API secret in client-side code. All authenticated requests should originate from your backend.
  </Accordion>
</AccordionGroup>

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="Error - INVALID_SIGNATURE">
    Your wallet's private key is incorrect or improperly formatted.

    **Solutions:**

    * Verify your private key is a valid hex string (starts with "0x")
    * Ensure you're using the correct key for the intended address
    * Check that the key has proper permissions
  </Accordion>

  <Accordion title="Error - NONCE_ALREADY_USED">
    The nonce you provided has already been used to create an API key.

    **Solutions:**

    * Use `deriveApiKey()` with the same nonce to retrieve existing credentials
    * Or use a different nonce with `createApiKey()`
  </Accordion>

  <Accordion title="Error - Invalid Funder Address">
    Your funder address is incorrect or doesn't match your wallet.

    **Solution:** Check your Polymarket profile address at [polymarket.com/settings](https://polymarket.com/settings).

    If it does not exist or user has never logged into Polymarket.com, deploy it first before creating L2 authentication.
  </Accordion>

  <Accordion title="Lost both credentials and nonce">
    Unfortunately, there's no way to recover lost API credentials without the nonce. You'll need to create new credentials:

    ```typescript  theme={null}
    // Create fresh credentials with a new nonce
    const newCreds = await client.createApiKey();
    // Save the nonce this time!
    ```
  </Accordion>
</AccordionGroup>

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Place Your First Order" icon="plus" href="/trading/quickstart">
    Learn how to create and submit orders.
  </Card>

  <Card title="Geographic Restrictions" icon="globe" href="/api-reference/geoblock">
    Check trading availability by region.
  </Card>
</CardGroup>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.polymarket.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Quickstart

> Place your first order on Polymarket

This guide walks you through placing an order on Polymarket end-to-end.

<Steps>
  <Step title="Install the SDK">
    <CodeGroup>
      ```bash TypeScript theme={null}
      npm install @polymarket/clob-client ethers@5
      ```

      ```bash Python theme={null}
      pip install py-clob-client
      ```
    </CodeGroup>
  </Step>

  <Step title="Set Up Your Client">
    Derive your API credentials and initialize the trading client. This example uses an EOA wallet (type `0`) — your wallet pays its own gas and acts as the funder:

    <CodeGroup>
      ```typescript TypeScript theme={null}
      import { ClobClient } from "@polymarket/clob-client";
      import { Wallet } from "ethers"; // v5.8.0

      const HOST = "https://clob.polymarket.com";
      const CHAIN_ID = 137; // Polygon mainnet
      const signer = new Wallet(process.env.PRIVATE_KEY);

      // Derive API credentials
      const tempClient = new ClobClient(HOST, CHAIN_ID, signer);
      const apiCreds = await tempClient.createOrDeriveApiKey();

      // Initialize trading client
      const client = new ClobClient(
        HOST,
        CHAIN_ID,
        signer,
        apiCreds,
        0, // EOA
        signer.address,
      );
      ```

      ```python Python theme={null}
      from py_clob_client.client import ClobClient
      import os

      host = "https://clob.polymarket.com"
      chain_id = 137  # Polygon mainnet
      private_key = os.getenv("PRIVATE_KEY")

      # Derive API credentials
      temp_client = ClobClient(host, key=private_key, chain_id=chain_id)
      api_creds = temp_client.create_or_derive_api_creds()

      # Initialize trading client
      client = ClobClient(
          host,
          key=private_key,
          chain_id=chain_id,
          creds=api_creds,
          signature_type=0,  # EOA
          funder="YOUR_WALLET_ADDRESS"
      )
      ```
    </CodeGroup>

    <Note>
      If you have a Polymarket.com account, your funds are in a proxy wallet — use
      signature type `1` or `2` instead. See [Signature
      Types](/trading/overview#signature-types) for details.
    </Note>

    <Warning>
      Before trading, your funder address needs **USDC.e** (for buying outcome
      tokens) and **POL** (for gas, if using EOA type `0`). Proxy wallet users
      (types `1` and `2`) can use Polymarket's gasless relayer instead.
    </Warning>
  </Step>

  <Step title="Place an Order">
    Get a token ID from the [Markets API](/market-data/fetching-markets), then create and submit your order:

    <CodeGroup>
      ```typescript TypeScript theme={null}
      import { Side, OrderType } from "@polymarket/clob-client";

      const response = await client.createAndPostOrder(
        {
          tokenID: "YOUR_TOKEN_ID",
          price: 0.5,
          size: 10,
          side: Side.BUY,
        },
        {
          tickSize: "0.01",
          negRisk: false, // Set to true for multi-outcome markets
        },
        OrderType.GTC,
      );

      console.log("Order ID:", response.orderID);
      console.log("Status:", response.status);
      ```

      ```python Python theme={null}
      from py_clob_client.clob_types import OrderArgs, OrderType
      from py_clob_client.order_builder.constants import BUY

      response = client.create_and_post_order(
          OrderArgs(
              token_id="YOUR_TOKEN_ID",
              price=0.50,
              size=10,
              side=BUY,
          ),
          options={
              "tick_size": "0.01",
              "neg_risk": False,  # Set to True for multi-outcome markets
          },
          order_type=OrderType.GTC
      )

      print("Order ID:", response["orderID"])
      print("Status:", response["status"])
      ```
    </CodeGroup>

    <Tip>
      Look up a market's `tickSize` and `negRisk` values using the SDK's
      `getTickSize()` and `getNegRisk()` methods, or from the market object returned
      by the API.
    </Tip>
  </Step>

  <Step title="Check Your Orders">
    <CodeGroup>
      ```typescript TypeScript theme={null}
      // View all open orders
      const openOrders = await client.getOpenOrders();
      console.log(`You have ${openOrders.length} open orders`);

      // View your trade history
      const trades = await client.getTrades();
      console.log(`You've made ${trades.length} trades`);

      // Cancel an order
      await client.cancelOrder(response.orderID);
      ```

      ```python Python theme={null}
      # View all open orders
      open_orders = client.get_orders()
      print(f"You have {len(open_orders)} open orders")

      # View your trade history
      trades = client.get_trades()
      print(f"You've made {len(trades)} trades")

      # Cancel an order
      client.cancel(order_id=response["orderID"])
      ```
    </CodeGroup>
  </Step>
</Steps>

***

## Troubleshooting

<AccordionGroup>
  <Accordion title="L2 AUTH NOT AVAILABLE - Invalid Signature">
    Wrong private key, signature type, or funder address for the derived API credentials.

    * Check that `signatureType` matches your account type (`0`, `1`, or `2`)
    * Ensure `funder` is correct for your wallet type
    * Re-derive credentials with `createOrDeriveApiKey()` if unsure
  </Accordion>

  <Accordion title="Order rejected - insufficient balance">
    Your funder address doesn't have enough tokens:

    * **BUY orders**: need USDC.e in your funder address
    * **SELL orders**: need outcome tokens in your funder address
    * Ensure you have more USDC.e than what's committed in open orders
  </Accordion>

  <Accordion title="Order rejected - insufficient allowance">
    You need to approve the Exchange contract to spend your tokens. This is
    typically done through the Polymarket UI on your first trade, or using the CTF
    contract's `setApprovalForAll()` method.
  </Accordion>

  <Accordion title="What is my funder address">
    Your funder address is the wallet where your funds are held:

    * **EOA (type 0)**: Your wallet address directly
    * **Proxy wallet (type 1 or 2)**: Go to [polymarket.com/settings](https://polymarket.com/settings) and look for the wallet address in the profile dropdown

    If the proxy wallet doesn't exist, log into Polymarket.com first (it's deployed on first login).
  </Accordion>

  <Accordion title="Blocked by Cloudflare or Geoblock">
    You're trying to place a trade from a restricted region. See [Geographic Restrictions](/api-reference/geoblock) for details.
  </Accordion>
</AccordionGroup>

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Create Orders" icon="plus" href="/trading/orders/create">
    Order types, tick sizes, and error handling
  </Card>

  <Card title="Order Attribution" icon="tag" href="/trading/orders/attribution">
    Attribute orders to your builder account for volume credit
  </Card>
</CardGroup>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.polymarket.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Fetching Markets

> Three strategies for discovering and querying markets

<Tip>
  Both the events and markets endpoints are paginated. See
  [pagination](#pagination) for details.
</Tip>

There are three main strategies for retrieving market data, each optimized for different use cases:

1. **By Slug** — Best for fetching specific individual markets or events
2. **By Tags** — Ideal for filtering markets by category or sport
3. **Via Events Endpoint** — Most efficient for retrieving all active markets

***

## Fetch by Slug

**Use case:** When you need to retrieve a specific market or event that you already know about.

Individual markets and events are best fetched using their unique slug identifier. The slug can be found directly in the Polymarket frontend URL.

### How to Extract the Slug

From any Polymarket URL, the slug is the path segment after `/event/`:

```
https://polymarket.com/event/fed-decision-in-october
                                ↑
                      Slug: fed-decision-in-october
```

### Examples

```bash  theme={null}
# Fetch an event by slug (query parameter)
curl "https://gamma-api.polymarket.com/events?slug=fed-decision-in-october"

# Or use the path endpoint
curl "https://gamma-api.polymarket.com/events/slug/fed-decision-in-october"
```

```bash  theme={null}
# Fetch a market by slug (query parameter)
curl "https://gamma-api.polymarket.com/markets?slug=fed-decision-in-october"

# Or use the path endpoint
curl "https://gamma-api.polymarket.com/markets/slug/fed-decision-in-october"
```

***

## Fetch by Tags

**Use case:** When you want to filter markets by category, sport, or topic.

Tags provide a way to categorize and filter markets. You can discover available tags and then use them to filter your requests.

### Discover Available Tags

**General tags:** `GET /tags` (Gamma API)

**Sports tags and metadata:** `GET /sports` (Gamma API)

The `/sports` endpoint returns metadata for sports including tag IDs, images, resolution sources, and series information.

### Filter by Tag

Once you have tag IDs, use the `tag_id` parameter in both events and markets endpoints:

```bash  theme={null}
# Fetch events for a specific tag
curl "https://gamma-api.polymarket.com/events?tag_id=100381&limit=10&active=true&closed=false"
```

### Additional Tag Filtering

You can also:

* Use `related_tags=true` to include related tag markets
* Exclude specific tags with `exclude_tag_id`

```bash  theme={null}
# Include related tags
curl "https://gamma-api.polymarket.com/events?tag_id=100381&related_tags=true&active=true&closed=false"
```

***

## Fetch All Active Markets

**Use case:** When you need to retrieve all available active markets, typically for broader analysis or market discovery.

The most efficient approach is to use the events endpoint with `active=true&closed=false`, as events contain their associated markets.

```bash  theme={null}
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100"
```

### Key Parameters

| Parameter   | Description                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `order`     | Field to order by (`volume_24hr`, `volume`, `liquidity`, `start_date`, `end_date`, `competitive`, `closed_time`) |
| `ascending` | Sort direction (`true` for ascending, `false` for descending). Default: `false`                                  |
| `active`    | Filter by active status (`true` for live tradable events)                                                        |
| `closed`    | Filter by closed status                                                                                          |
| `limit`     | Results per page                                                                                                 |
| `offset`    | Number of results to skip for pagination                                                                         |

```bash  theme={null}
# Get the highest volume active events
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=100"
```

***

## Pagination

All list endpoints return paginated responses with `limit` and `offset` parameters:

```bash  theme={null}
# Page 1: First 50 results
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&offset=0"

# Page 2: Next 50 results
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&offset=50"

# Page 3: Next 50 results
curl "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=50&offset=100"
```

***

## Best Practices

1. **For individual markets:** Use the slug method for direct lookups
2. **For category browsing:** Use tag filtering to reduce API calls
3. **For complete market discovery:** Use the events endpoint with pagination
4. **Always include `active=true&closed=false`** unless you specifically need historical data
5. **Use the events endpoint** and work backwards — events contain their associated markets, reducing the number of API calls needed

***

## Next Steps

<CardGroup cols={2}>
  <Card title="API Reference" icon="code" href="/api-reference/introduction">
    Full endpoint documentation with parameters and response schemas.
  </Card>

  <Card title="Subgraph" icon="share-nodes" href="/market-data/subgraph">
    Query onchain data directly from the Polymarket subgraph.
  </Card>
</CardGroup>
> ## Documentation Index
> Fetch the complete documentation index at: https://docs.polymarket.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Markets & Events

> Understanding the fundamental building blocks of Polymarket

Every prediction on Polymarket is structured around two core concepts: **markets** and **events**. Understanding how they relate is essential for building on the platform.

<Frame>
  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=4c62bd08a405868307cdd6799b368ca5" alt="" className="dark:hidden" data-og-width="1540" width="1540" data-og-height="952" height="952" data-path="images/core-concepts/event-market.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=280&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=0bd6fa8d9505b0f2fa4626c7d596b0e8 280w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=560&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=f6acefe7559f5e48d1903fb772754aeb 560w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=840&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=603c382f66e84f9020d45cd43ac59ea4 840w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=1100&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=eaed4a9b88ff99c795bb27654a1914cd 1100w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=1650&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=020326eff37833ae1111575e85ecf898 1650w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event-market.png?w=2500&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=57ce32b2abd1a2f7193a0c9bad064fbc 2500w" />

  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=2eb5c9b0f8a2afe52bc2e717b7b796a2" alt="" className="hidden dark:block" data-og-width="1540" width="1540" data-og-height="952" height="952" data-path="images/dark/core-concepts/event-market.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=280&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=c4da01c8fec2e6cfe7f2d4934200ebf7 280w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=560&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=e52eafe9dca3370f2cf9f48aa7a587fa 560w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=840&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=420de664532386a57e674c37e2475f45 840w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=1100&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=e7aeeb9c591df58d3de1d3d3ee9b6aa5 1100w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=1650&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=b68ab7f2f68b3ee6c1670edab68dddd6 1650w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event-market.png?w=2500&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=89ae2017bf3ee1eec57ebd4ac4b5cddc 2500w" />
</Frame>

## Markets

A **market** is the fundamental tradable unit on Polymarket. Each market represents a single binary question with Yes/No outcomes.

<Frame>
  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=0c9a264aec9a22ce5a20c4cc7980806d" alt="" className="dark:hidden" data-og-width="1540" width="1540" data-og-height="952" height="952" data-path="images/core-concepts/event.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=280&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=72a07b6b9d83367b9aa829a60c07f2b3 280w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=560&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=a222505efdc485a3b2410055394109cd 560w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=840&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=1afd89af327cef04f03a0c085a4a0ef5 840w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=1100&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=a419c0d09ca0cbb7f870372157c56727 1100w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=1650&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=19797452df63f42cf2d84e709483a4a2 1650w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/core-concepts/event.png?w=2500&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=4643344994e4717bfdc94bad606eda7f 2500w" />

  <img src="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=912e41bebfe8c1a43ef53b89685ca3d2" alt="" className="hidden dark:block" data-og-width="1540" width="1540" data-og-height="952" height="952" data-path="images/dark/core-concepts/event.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=280&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=541e0c044f32f667c9c59e31f1572167 280w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=560&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=16e79044e1f4cb99e3c28335308ea821 560w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=840&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=71d440db449638eec0f3b8a5d80bef13 840w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=1100&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=25f781834c41ecd4d835e0c209bceb2e 1100w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=1650&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=1a2120728cf262e68d993a1db44371b1 1650w, https://mintcdn.com/polymarket-292d1b1b/FOMte3ewbG-LVy3k/images/dark/core-concepts/event.png?w=2500&fit=max&auto=format&n=FOMte3ewbG-LVy3k&q=85&s=9ecb8ab37d7fc4460fa07c892ab1978a 2500w" />
</Frame>

Every market has:

| Identifier       | Description                                                              |
| ---------------- | ------------------------------------------------------------------------ |
| **Condition ID** | Unique identifier for the market's condition in the CTF contracts        |
| **Question ID**  | Hash of the market question used for resolution                          |
| **Token IDs**    | ERC1155 token IDs used for trading on the CLOB — one for Yes, one for No |

<Note>
  Markets can only be traded via the CLOB if `enableOrderBook` is `true`. Some
  markets may exist onchain but not be available for order book trading.
</Note>

### Market Example

A simple market might be:

> **"Will Bitcoin reach \$150,000 by December 2026?"**

This creates two outcome tokens:

* **Yes token** - Redeemable for `$1` if Bitcoin reaches `$150k`
* **No token** - Redeemable for `$1` if Bitcoin doesn't reach `$100k`

## Events

An **event** is a container that groups one or more related markets together. Events provide organizational structure and enable multi-outcome predictions.

### Single-Market Events

When an event contains just one market, it creates a simple market pair. The event and market are essentially equivalent.

```
Event: Will Bitcoin reach $100,000 by December 2024?
└── Market: Will Bitcoin reach $100,000 by December 2024? (Yes/No)
```

### Multi-Market Events

When an event contains two or more markets, it creates a grouped market pair. This enables mutually exclusive multi-outcome predictions.

```
Event: Who will win the 2024 Presidential Election?
├── Market: Donald Trump? (Yes/No)
├── Market: Joe Biden? (Yes/No)
├── Market: Kamala Harris? (Yes/No)
└── Market: Other? (Yes/No)
```

## Identifying Markets

Every market and event has a unique **slug** that appears in the Polymarket URL:

```
https://polymarket.com/event/fed-decision-in-october
                              └── slug: fed-decision-in-october
```

You can use slugs to fetch specific markets or events from the API:

```bash  theme={null}
# Fetch event by slug
curl "https://gamma-api.polymarket.com/events?slug=fed-decision-in-october"
```

## Sports Markets

Specifically for sports markets, outstanding limit orders are **automatically cancelled** once the game begins, clearing the order book at the official start time. However, game start times can shift — if a game starts earlier than scheduled, orders may not be cleared in time. Always monitor your orders closely around game start times.

***

## Next Steps

<CardGroup cols={2}>
  <Card title="Prices & Orderbook" icon="chart-line" href="/concepts/prices-orderbook">
    Learn how prices are determined and how the order book works.
  </Card>

  <Card title="Fetching Market Data" icon="code" href="/market-data/overview">
    Start querying markets and events from the API.
  </Card>
</CardGroup>
