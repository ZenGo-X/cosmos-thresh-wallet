// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

const rp = require('request-promise');
const Chains = {
  cosmoshub_3: 'https://api.cosmos.network',
  gaia: 'http://ec2-54-189-179-159.us-west-2.compute.amazonaws.com:1317',
};

export type ChainName = 'gaia' | 'cosmoshub_3';

export async function get(chainName: ChainName, route: string): Promise<any> {
  // console.log(`${Chains[chainName]}${route}`);
  return rp({
    method: 'GET',
    uri: `${Chains[chainName]}${route}`,
    json: true,
  });
}

export async function post(
  chainName: ChainName,
  route: string,
  body: any,
): Promise<any> {
  // console.log(`${Chains[chainName]}${route}`);
  // console.log(JSON.stringify(body));
  return rp({
    method: 'POST',
    uri: `${Chains[chainName]}${route}`,
    body,
    json: true,
  });
}
