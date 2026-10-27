'use strict';

const PREFIX = 'ssh-connect.password';

class PasswordStore {
    constructor(secrets) {
        if (!secrets || typeof secrets.get !== 'function') {
            throw new Error('PasswordStore requires a VS Code SecretStorage instance.');
        }
        this.secrets = secrets;
    }

    hostKey(connection) {
        return `${PREFIX}.host.${connection.user}@${connection.host}:${connection.port}`;
    }

    groupKey(group) {
        return `${PREFIX}.group.${group}`;
    }

    getHost(connection) {
        return this.secrets.get(this.hostKey(connection));
    }

    getGroup(group) {
        return this.secrets.get(this.groupKey(group));
    }

    saveHost(connection, password) {
        return this.secrets.store(this.hostKey(connection), password);
    }

    saveGroup(group, password) {
        return this.secrets.store(this.groupKey(group), password);
    }

    deleteHost(connection) {
        return this.secrets.delete(this.hostKey(connection));
    }

    deleteGroup(group) {
        return this.secrets.delete(this.groupKey(group));
    }
}

module.exports = {
    PasswordStore,
    PREFIX
};
