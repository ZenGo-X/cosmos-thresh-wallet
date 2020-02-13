// Cosmos-thresh-wallet
//
// Copyright 2020 by Kzen Networks (kzencorp.com)
// Cosmos-threash-wallet is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public
// License as published by the Free Software Foundation, either
// version 3 of the License, or (at your option) any later version.

import { Party1 } from '@kzen-networks/thresh-sig';

export class TerraThreshSigServer {
    private p1: Party1;

    constructor() {
        this.p1 = new Party1();
    }

    public launch() {
        this.p1.launchServer();
    }
}
