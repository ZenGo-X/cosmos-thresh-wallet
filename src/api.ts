const rp = require('request-promise');
const Chains = {
  cosmoshub_3: 'https://fcd.terra.dev',
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
