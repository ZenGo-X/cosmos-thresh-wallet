const rp = require("request-promise");
const Chains = {
  columbus_2: "https://fcd.terra.dev",
  gaia: "http://ec2-54-189-179-159.us-west-2.compute.amazonaws.com:1317"
};

export type ChainName = "gaia" | "columbus_2";

export async function get(chainName: ChainName, route: string): Promise<any> {
  return rp({
    method: "GET",
    uri: `${Chains[chainName]}${route}`,
    json: true
  });
}

export async function post(
  chainName: ChainName,
  route: string,
  body: any
): Promise<any> {
  return rp({
    method: "POST",
    uri: `${Chains[chainName]}${route}`,
    body,
    json: true
  });
}
