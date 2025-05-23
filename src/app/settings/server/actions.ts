'use server'

import { getAdminUserSession, getAuthUserSession, saveFormAction, simpleAction } from "@/server/utils/action-wrapper.utils";
import paramService, { ParamService } from "@/server/services/param.service";
import { QsIngressSettingsModel, qsIngressSettingsZodModel } from "@/shared/model/qs-settings.model";
import { QsLetsEncryptSettingsModel, qsLetsEncryptSettingsZodModel } from "@/shared/model/qs-letsencrypt-settings.model";
import quickStackService from "@/server/services/qs.service";
import { ServerActionResult, SuccessActionResult } from "@/shared/model/server-action-error-return.model";
import registryService from "@/server/services/registry.service";
import { RegistryStorageLocationSettingsModel, registryStorageLocationSettingsZodModel } from "@/shared/model/registry-storage-location-settings.model";
import { Constants } from "@/shared/utils/constants";
import { QsPublicIpv4SettingsModel, qsPublicIpv4SettingsZodModel } from "@/shared/model/qs-public-ipv4-settings.model";
import ipAddressFinderAdapter from "@/server/adapter/ip-adress-finder.adapter";
import { KubeSizeConverter } from "@/shared/utils/kubernetes-size-converter.utils";
import buildService from "@/server/services/build.service";
import traefikMeDomainStandaloneService from "@/server/services/standalone-services/traefik-me-domain-standalone.service";
import standalonePodService from "@/server/services/standalone-services/standalone-pod.service";
import maintenanceService from "@/server/services/standalone-services/maintenance.service";
import appLogsService from "@/server/services/standalone-services/app-logs.service";

export const updateIngressSettings = async (prevState: any, inputData: QsIngressSettingsModel) =>
  saveFormAction(inputData, qsIngressSettingsZodModel, async (validatedData) => {
    await getAdminUserSession();

    const url = new URL(validatedData.serverUrl.includes('://') ? validatedData.serverUrl : `https://${validatedData.serverUrl}`);

    await paramService.save({
      name: ParamService.QS_SERVER_HOSTNAME,
      value: url.hostname
    });

    await paramService.save({
      name: ParamService.DISABLE_NODEPORT_ACCESS,
      value: validatedData.disableNodePortAccess + ''
    });

    await quickStackService.createOrUpdateService(!validatedData.disableNodePortAccess);
    await quickStackService.createOrUpdateIngress(validatedData.serverUrl);
  });


export const updatePublicIpv4Settings = async (prevState: any, inputData: QsPublicIpv4SettingsModel) =>
  saveFormAction(inputData, qsPublicIpv4SettingsZodModel, async (validatedData) => {
    await getAdminUserSession();

    await paramService.save({
      name: ParamService.PUBLIC_IPV4_ADDRESS,
      value: validatedData.publicIpv4
    });
  });


export const updatePublicIpv4SettingsAutomatically = async () =>
  simpleAction(async () => {
    await getAdminUserSession();

    const publicIpv4 = await ipAddressFinderAdapter.getPublicIpOfServer();
    await paramService.save({
      name: ParamService.PUBLIC_IPV4_ADDRESS,
      value: publicIpv4
    });
  });

export const updateLetsEncryptSettings = async (prevState: any, inputData: QsLetsEncryptSettingsModel) =>
  saveFormAction(inputData, qsLetsEncryptSettingsZodModel, async (validatedData) => {
    await getAdminUserSession();

    await paramService.save({
      name: ParamService.LETS_ENCRYPT_MAIL,
      value: validatedData.letsEncryptMail
    });

    await quickStackService.createOrUpdateCertIssuer(validatedData.letsEncryptMail);
  });

export const getConfiguredHostname: () => Promise<ServerActionResult<unknown, string | undefined>> = async () =>
  simpleAction(async () => {
    await getAdminUserSession();

    return await paramService.getString(ParamService.QS_SERVER_HOSTNAME);
  });


export const cleanupOldTmpFiles = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    await maintenanceService.deleteAllTempFiles();
    return new SuccessActionResult(undefined, 'Successfully cleaned up temp files.');
  });

export const cleanupOldBuildJobs = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    await buildService.deleteAllFailedOrSuccededBuilds();
    return new SuccessActionResult(undefined, 'Successfully cleaned up old build jobs.');
  });

export const updateQuickstack = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    const useCaranyChannel = await paramService.getBoolean(ParamService.USE_CANARY_CHANNEL, false);
    await quickStackService.updateQuickStack(useCaranyChannel);
    return new SuccessActionResult(undefined, 'QuickStack will be updated, refresh the page in a few seconds.');
  });

export const updateRegistry = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    const registryLocation = await paramService.getString(ParamService.REGISTRY_SOTRAGE_LOCATION, Constants.INTERNAL_REGISTRY_LOCATION);
    await registryService.deployRegistry(registryLocation!, true);
    return new SuccessActionResult(undefined, 'Registry will be updated, this might take a few seconds.');
  });

export const updateTraefikMeCertificates = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    await traefikMeDomainStandaloneService.updateTraefikMeCertificate();
    return new SuccessActionResult(undefined, 'Certificates will be updated, this might take a few seconds.');
  });

export const deleteAllFailedAndSuccededPods = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    await standalonePodService.deleteAllFailedAndSuccededPods();
    return new SuccessActionResult(undefined, 'Successfully deleted all failed and succeeded pods.');
  });

export const purgeRegistryImages = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    const deletedSize = await registryService.purgeRegistryImages();
    return new SuccessActionResult(undefined, `Successfully purged ${KubeSizeConverter.convertBytesToReadableSize(deletedSize)} of images.`);
  });

export const deleteOldAppLogs = async () =>
  simpleAction(async () => {
    await getAdminUserSession();
    await appLogsService.deleteOldAppLogs();
    return new SuccessActionResult(undefined, `Successfully deletes old app logs.`);
  });

export const setCanaryChannel = async (useCanaryChannel: boolean) =>
  simpleAction(async () => {
    await getAdminUserSession();
    await paramService.save({
      name: ParamService.USE_CANARY_CHANNEL,
      value: !!useCanaryChannel ? 'true' : 'false'
    });
    return new SuccessActionResult(undefined, `Turned ${useCanaryChannel ? 'on' : 'off'} the canary channel.`);
  });

export const setRegistryStorageLocation = async (prevState: any, inputData: RegistryStorageLocationSettingsModel) =>
  saveFormAction(inputData, registryStorageLocationSettingsZodModel, async (validatedData) => {
    await getAdminUserSession();

    await registryService.deployRegistry(validatedData.registryStorageLocation, true);

    await paramService.save({
      name: ParamService.REGISTRY_SOTRAGE_LOCATION,
      value: validatedData.registryStorageLocation
    });
  });