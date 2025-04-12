import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoreHorizontal, PlusCircle, Power, Trash2, Edit, WifiOff, Loader2, Network, Target, PlugZap } from 'lucide-react';

import { Toaster, toast } from 'sonner';

interface Device {
    id: string;
    name: string;
    mac: string;
    targetAddr?: string | null;
    port?: number | null;
}

function App() {
    const { t } = useTranslation();

    const [devices, setDevices] = useState<Device[]>([]);
    const [isLoadingDevices, setIsLoadingDevices] = useState(true);
    const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [modalFormData, setModalFormData] = useState({ name: '', mac: '', targetAddr: '', port: '' });
    const [isSavingDevice, setIsSavingDevice] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
    const [isDeletingDevice, setIsDeletingDevice] = useState(false);
    const [sendingWolDeviceId, setSendingWolDeviceId] = useState<string | null>(null);

    const showToast = useCallback((title: string, description: string, variant: "default" | "destructive" = "default") => {
        if (variant === "destructive") {
            toast.error(title, { description: description });
        } else {
            toast.success(title, { description: description });
        }
    }, []);

    const handleError = useCallback((error: unknown, contextKey: string, contextParams?: Record<string, any>) => {
        const context = t(contextKey, contextParams);
        console.error(`[${context}] Error:`, error);
        const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : t('common.unknownError'));
        showToast(t('common.error'), t('toast.errorDescription', { context: context, errorMessage: errorMessage }), "destructive");
    }, [showToast, t]);

    const loadDevices = useCallback(async () => {
        console.log("장치 목록 로드를 시도합니다...");
        setIsLoadingDevices(true);
        try {
            const loadedDevices = await invoke<Device[]>('load_devices');
            setDevices(loadedDevices);
            console.log("장치 로드 완료:", loadedDevices);
        } catch (error) {
            handleError(error, "errorContext.loadDevices");
            setDevices([]);
        } finally {
            setIsLoadingDevices(false);
        }
    }, [handleError]);

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    const handleSendWolForDevice = async (device: Device) => {
        setSendingWolDeviceId(device.id);
        try {
            await invoke('send_wol_packet', {
                macAddress: device.mac,
                targetAddr: device.targetAddr || null,
                port: device.port
            });
            showToast(t('toast.wol.sendSuccessTitle'), t('toast.wol.sendSuccessDescription', { mac: device.mac }), "default");
            console.log(`WOL 전송 성공: MAC=${device.mac}, Target=${device.targetAddr || 'Default'}, Port=${device.port ?? 9}`);
        } catch (error) {
            handleError(error, "errorContext.sendWol", { mac: device.mac });
        } finally {
            setSendingWolDeviceId(null);
        }
    };

    const handleModalFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setModalFormData(prev => ({ ...prev, [name]: value }));
    };

    const openAddEditModal = (device: Device | null = null) => {
        setEditingDevice(device);
        setModalFormData(device
            ? { name: device.name, mac: device.mac, targetAddr: device.targetAddr || '', port: device.port?.toString() || '' }
            : { name: '', mac: '', targetAddr: '', port: '' }
        );
        setIsAddEditModalOpen(true);
        setIsSavingDevice(false);
    };

    const handleSaveDevice = async () => {
        const { name, mac, targetAddr, port: portStr } = modalFormData;
        if (!name || !mac) {
            showToast(t('toast.device.saveFailTitle'), t('toast.device.saveFailDescription'), "destructive");
            return;
        }

        let port: number | null = null;
        if (portStr) {
            const parsedPort = parseInt(portStr, 10);
            if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
                port = parsedPort;
            } else {
                showToast(t('toast.device.saveFailTitle'), "유효한 포트 번호(1-65535)를 입력하거나 비워두세요.", "destructive");
                return;
            }
        }

        setIsSavingDevice(true);
        try {
            let updatedList: Device[];
            const devicePayload: Device = {
                id: editingDevice ? editingDevice.id : '',
                name,
                mac,
                targetAddr: targetAddr || null,
                port: port
            };

            if (editingDevice) {
                updatedList = await invoke<Device[]>('update_device', { device: devicePayload });
                showToast(t('toast.device.updateSuccessTitle'), t('toast.device.updateSuccessDescription', { name: name }), "default");
            } else {
                updatedList = await invoke<Device[]>('add_device', { device: devicePayload });
                showToast(t('toast.device.addSuccessTitle'), t('toast.device.addSuccessDescription', { name: name }), "default");
            }
            setDevices(updatedList);
            setIsAddEditModalOpen(false);
        } catch (error) {
            handleError(error, editingDevice ? "errorContext.updateDevice" : "errorContext.addDevice");
        } finally {
            setIsSavingDevice(false);
        }
    };

    const openDeleteModal = (device: Device) => {
        setDeletingDevice(device);
        setIsDeleteModalOpen(true);
        setIsDeletingDevice(false);
    };

    const handleDeleteDevice = async () => {
        if (!deletingDevice) return;
        setIsDeletingDevice(true);
        try {
            const updatedList = await invoke<Device[]>('delete_device', { deviceId: deletingDevice.id });
            setDevices(updatedList);
            showToast(t('toast.device.deleteSuccessTitle'), t('toast.device.deleteSuccessDescription', { name: deletingDevice.name }), "default");
            setIsDeleteModalOpen(false);
            setDeletingDevice(null);
        } catch (error) {
            handleError(error, "errorContext.deleteDevice");
        } finally {
            setIsDeletingDevice(false);
        }
    };

    return (
        <div className="container mx-auto p-4 md:p-6 max-w-6xl bg-background min-h-screen">
            <Toaster richColors position="top-right" />

            <header className="flex items-center justify-between mb-6 pb-4 border-b">
                <h1 className="text-2xl font-bold text-foreground">{t('common.appName')}</h1>
                <Button onClick={() => openAddEditModal()}>
                    <PlusCircle className="mr-2 h-4 w-4" /> {t('header.addNewDevice')}
                </Button>
            </header>

            <main>
                {isLoadingDevices ? (
                    <div className="text-center text-muted-foreground py-10">
                        <p>{t('deviceList.loading')}</p>
                    </div>
                ) : devices.length === 0 ? (
                    <div className="text-center py-10 px-6 border-2 border-dashed rounded-lg border-border">
                         <WifiOff className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                         <h3 className="text-lg font-medium text-foreground">{t('deviceList.noDevices')}</h3>
                         <p className="mt-1 text-sm text-muted-foreground">
                             {t('deviceList.noDevicesDescription')}
                         </p>
                         <div className="mt-6">
                             <Button onClick={() => openAddEditModal()}>
                                 <PlusCircle className="mr-2 h-4 w-4" /> {t('deviceList.addNewDevice')}
                             </Button>
                         </div>
                     </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1">
                        {devices.map((device) => {
                            const targetDisplay = `${device.targetAddr || t('common.defaultValue')}:${device.port ?? 9}`;
                            const targetTooltip = `${device.targetAddr || t('deviceCard.defaultTargetAddrTooltip')}, ${t('deviceCard.portLabel')}: ${device.port ?? 9}`;

                            return (
                                <Card key={device.id} className="flex flex-col overflow-hidden py-2 px-2">
                                    <CardHeader className="flex flex-row items-center justify-between ps-3 pe-1 pb-1">
                                        <div className="flex-1 overflow-hidden mr-2">
                                            <CardTitle className="text-base font-semibold truncate" title={device.name}>{device.name}</CardTitle>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 flex-shrink-0"
                                                onClick={() => handleSendWolForDevice(device)}
                                                disabled={sendingWolDeviceId === device.id}
                                                aria-label={t('deviceCard.sendWol')}
                                                title={t('deviceCard.sendWol')}
                                            >
                                                {sendingWolDeviceId === device.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Power className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label={t('deviceCard.manageMenu')} title={t('deviceCard.manageMenu')}>
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>{t('common.manage')}</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onClick={() => openAddEditModal(device)}>
                                                        <Edit className="mr-2 h-4 w-4" />
                                                        {t('common.edit')}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => openDeleteModal(device)} className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        {t('common.delete')}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 pt-1 space-y-1.5">
                                        <div className="flex items-center text-xs text-muted-foreground" title={device.mac}>
                                            <Network className="h-3 w-3 mr-1.5 flex-shrink-0"/>
                                            <span className="truncate">{device.mac}</span>
                                        </div>
                                        <div className="flex items-center text-xs text-muted-foreground" title={targetTooltip}>
                                            <Target className="h-3 w-3 mr-1.5 flex-shrink-0"/>
                                            <span className="truncate">{targetDisplay}</span>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </main>

            <Dialog open={isAddEditModalOpen} onOpenChange={setIsAddEditModalOpen}>
                 <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                         <DialogTitle>{editingDevice ? t('addEditDialog.title.edit') : t('addEditDialog.title.add')}</DialogTitle>
                         <DialogDescription>
                             {editingDevice ? t('addEditDialog.description.edit', { name: editingDevice.name }) : t('addEditDialog.description.add')}
                         </DialogDescription>
                     </DialogHeader>
                     <div className="grid gap-4 py-4">
                         <div className="space-y-1.5">
                             <Label htmlFor="name">
                                 {t('addEditDialog.label.name')} <span className="text-red-500">*</span>
                             </Label>
                             <Input
                                 id="name"
                                 name="name"
                                 value={modalFormData.name}
                                 onChange={handleModalFormChange}
                                 required
                             />
                         </div>
                         <div className="space-y-1.5">
                             <Label htmlFor="mac">
                                 {t('addEditDialog.label.mac')} <span className="text-red-500">*</span>
                             </Label>
                             <Input
                                 id="mac"
                                 name="mac"
                                 value={modalFormData.mac}
                                 onChange={handleModalFormChange}
                                 placeholder={t('addEditDialog.placeholder.mac')}
                                 required
                             />
                         </div>
                         <div className="space-y-1.5">
                             <Label htmlFor="targetAddr">
                                 {t('addEditDialog.label.targetAddr')}
                             </Label>
                             <Input
                                 id="targetAddr"
                                 name="targetAddr"
                                 value={modalFormData.targetAddr}
                                 onChange={handleModalFormChange}
                                 placeholder={t('addEditDialog.placeholder.targetAddr')}
                             />
                         </div>
                         <div className="space-y-1.5">
                             <Label htmlFor="port">
                                 {t('addEditDialog.label.port')}
                             </Label>
                             <Input
                                 id="port"
                                 name="port"
                                 type="number"
                                 min="1"
                                 max="65535"
                                 value={modalFormData.port}
                                 onChange={handleModalFormChange}
                                 placeholder={t('addEditDialog.placeholder.port')}
                             />
                         </div>
                     </div>
                     <DialogFooter className="flex-row justify-end space-x-2">
                         <DialogClose asChild>
                             <Button type="button" variant="outline" disabled={isSavingDevice}>{t('common.cancel')}</Button>
                         </DialogClose>
                         <Button type="button" onClick={handleSaveDevice} disabled={isSavingDevice}>
                             {isSavingDevice ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.saving')}</>) : t('common.save')}
                         </Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>

            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                 <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                         <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
                         <DialogDescription>
                             {t('deleteDialog.description', { name: deletingDevice?.name })}
                         </DialogDescription>
                     </DialogHeader>
                     <DialogFooter className="flex-row justify-end space-x-2">
                         <DialogClose asChild>
                             <Button type="button" variant="outline" disabled={isDeletingDevice}>{t('common.cancel')}</Button>
                         </DialogClose>
                         <Button type="button" variant="destructive" onClick={handleDeleteDevice} disabled={isDeletingDevice}>
                              {isDeletingDevice ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.deleting')}</>) : t('common.delete') + ' ' + t('common.confirm')}
                         </Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>
        </div>
    );
}

export default App;
