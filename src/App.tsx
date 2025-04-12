import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next'; // react-i18next 훅 임포트

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
import { MoreHorizontal, PlusCircle, Power, Trash2, Edit, WifiOff, Loader2, Network, Target } from 'lucide-react';

import { Toaster, toast } from 'sonner';

// 장치 정보 타입 정의
interface Device {
    id: string;
    name: string;
    mac: string;
    targetAddr?: string;
}

// App 컴포넌트
function App() {
    const { t } = useTranslation(); // 번역 함수 t 가져오기

    // --- 상태 관리 ---
    const [devices, setDevices] = useState<Device[]>([]);
    const [isLoadingDevices, setIsLoadingDevices] = useState(true);
    const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
    const [editingDevice, setEditingDevice] = useState<Device | null>(null);
    const [modalFormData, setModalFormData] = useState({ name: '', mac: '', targetAddr: '' });
    const [isSavingDevice, setIsSavingDevice] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingDevice, setDeletingDevice] = useState<Device | null>(null);
    const [isDeletingDevice, setIsDeletingDevice] = useState(false);
    const [sendingWolDeviceId, setSendingWolDeviceId] = useState<string | null>(null);

    // ThemeProvider를 사용한다고 가정하고 기존 테마 감지 로직 주석 처리 또는 제거
    // useEffect(() => { ... }, []);

    // --- 유틸리티 함수 ---
    // useCallback 안에서 t 함수를 사용하려면 의존성 배열에 t를 추가해야 할 수 있으나,
    // t 함수는 일반적으로 안정적이므로 생략해도 무방한 경우가 많습니다.
    // 필요 시 [t] 를 의존성 배열에 추가하세요.
    const showToast = useCallback((title: string, description: string, variant: "default" | "destructive" = "default") => {
        if (variant === "destructive") {
            toast.error(title, { description: description });
        } else {
            toast.success(title, { description: description });
        }
    }, []); // t 함수가 안정적이라고 가정

    const handleError = useCallback((error: unknown, contextKey: string, contextParams?: Record<string, any>) => {
        const context = t(contextKey, contextParams); // 오류 발생 위치 번역
        console.error(`[${context}] Error:`, error);
        const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : t('common.unknownError'));
        // 오류 토스트 메시지 표시 (제목과 설명을 번역하여 전달)
        showToast(t('common.error'), t('toast.errorDescription', { context: context, errorMessage: errorMessage }), "destructive");
    }, [showToast, t]); // t 함수 의존성 추가

    // --- 데이터 로딩 ---
    const loadDevices = useCallback(async () => {
        console.log("장치 목록 로드를 시도합니다..."); // 개발용 로그는 번역 불필요
        setIsLoadingDevices(true);
        try {
            const loadedDevices = await invoke<Device[]>('load_devices');
            setDevices(loadedDevices);
            console.log("장치 로드 완료:", loadedDevices); // 개발용 로그
        } catch (error) {
            handleError(error, "errorContext.loadDevices"); // 에러 컨텍스트 키 전달
            setDevices([]);
        } finally {
            setIsLoadingDevices(false);
        }
    }, [handleError]); // handleError가 t를 사용하므로, loadDevices는 handleError에만 의존

    useEffect(() => {
        loadDevices();
    }, [loadDevices]);

    // --- WOL 패킷 전송 핸들러 ---
    const handleSendWol = useCallback(async (mac: string, targetAddr?: string): Promise<boolean> => {
        if (!mac) {
            showToast(t('toast.wol.sendFailTitle'), t('toast.wol.sendFailDescription'), "destructive");
            return false;
        }
        console.log(`WOL 전송 시도: MAC=${mac}, Target=${targetAddr || t('common.defaultValue')}`); // 개발용 로그
        try {
            await invoke('send_wol_packet', { macAddress: mac, targetAddr: targetAddr || null });
            showToast(t('toast.wol.sendSuccessTitle'), t('toast.wol.sendSuccessDescription', { mac: mac }), "default");
            console.log(`WOL 전송 성공: MAC=${mac}`); // 개발용 로그
            return true;
        } catch (error) {
            handleError(error, "errorContext.sendWol", { mac: mac }); // 에러 컨텍스트 키 및 파라미터 전달
            return false;
        }
    }, [handleError, showToast, t]); // t 함수 의존성 추가

    const handleSendWolForDevice = async (device: Device) => {
        setSendingWolDeviceId(device.id);
        await handleSendWol(device.mac, device.targetAddr);
        setSendingWolDeviceId(null);
    };

    // --- 장치 관리 핸들러 ---
    const handleModalFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setModalFormData(prev => ({ ...prev, [name]: value }));
    };

    const openAddEditModal = (device: Device | null = null) => {
        setEditingDevice(device);
        setModalFormData(device ? { name: device.name, mac: device.mac, targetAddr: device.targetAddr || '' } : { name: '', mac: '', targetAddr: '' });
        setIsAddEditModalOpen(true);
        setIsSavingDevice(false);
    };

    const handleSaveDevice = async () => {
        const { name, mac, targetAddr } = modalFormData;
        if (!name || !mac) {
            showToast(t('toast.device.saveFailTitle'), t('toast.device.saveFailDescription'), "destructive");
            return;
        }
        setIsSavingDevice(true);
        try {
            let updatedList: Device[];
            if (editingDevice) {
                const devicePayload = { id: editingDevice.id, name, mac, targetAddr: targetAddr || null };
                updatedList = await invoke<Device[]>('update_device', { device: devicePayload });
                showToast(t('toast.device.updateSuccessTitle'), t('toast.device.updateSuccessDescription', { name: name }), "default");
            } else {
                const devicePayload = { name, mac, targetAddr: targetAddr || null, id: '' };
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

    // --- 렌더링 ---
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
                        {devices.map((device) => (
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
                                    <div className="flex items-center text-xs text-muted-foreground" title={device.targetAddr || t('deviceCard.defaultTargetAddrTooltip')}>
                                        <Target className="h-3 w-3 mr-1.5 flex-shrink-0"/>
                                        <span className="truncate">{device.targetAddr || t('common.defaultValue')}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </main>

            {/* --- 추가/수정 다이얼로그 --- */}
            <Dialog open={isAddEditModalOpen} onOpenChange={setIsAddEditModalOpen}>
                 <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                         {/* 조건부 제목 번역 */}
                         <DialogTitle>{editingDevice ? t('addEditDialog.title.edit') : t('addEditDialog.title.add')}</DialogTitle>
                         <DialogDescription>
                             {/* 조건부 설명 번역 (보간 포함) */}
                             {editingDevice ? t('addEditDialog.description.edit', { name: editingDevice.name }) : t('addEditDialog.description.add')}
                         </DialogDescription>
                     </DialogHeader>
                     <div className="grid gap-4 py-4">
                         {/* 이름 필드 */}
                         <div className="grid grid-cols-1 sm:grid-cols-4 sm:items-center gap-x-4 gap-y-1.5">
                             <Label htmlFor="name" className="sm:text-right">
                                 {t('addEditDialog.label.name')} <span className="text-red-500">*</span>
                             </Label>
                             <Input
                                 id="name"
                                 name="name"
                                 value={modalFormData.name}
                                 onChange={handleModalFormChange}
                                 className="sm:col-span-3"
                                 required
                             />
                         </div>
                         {/* MAC 주소 필드 */}
                         <div className="grid grid-cols-1 sm:grid-cols-4 sm:items-center gap-x-4 gap-y-1.5">
                             <Label htmlFor="mac" className="sm:text-right">
                                 {t('addEditDialog.label.mac')} <span className="text-red-500">*</span>
                             </Label>
                             <Input
                                 id="mac"
                                 name="mac"
                                 value={modalFormData.mac}
                                 onChange={handleModalFormChange}
                                 className="sm:col-span-3"
                                 placeholder={t('addEditDialog.placeholder.mac')}
                                 required
                             />
                         </div>
                         {/* 대상 주소 필드 */}
                         <div className="grid grid-cols-1 sm:grid-cols-4 sm:items-center gap-x-4 gap-y-1.5">
                             <Label htmlFor="targetAddr" className="sm:text-right">
                                 {t('addEditDialog.label.targetAddr')}
                             </Label>
                             <Input
                                 id="targetAddr"
                                 name="targetAddr"
                                 value={modalFormData.targetAddr}
                                 onChange={handleModalFormChange}
                                 className="sm:col-span-3"
                                 placeholder={t('addEditDialog.placeholder.targetAddr')}
                             />
                         </div>
                     </div>
                     <DialogFooter className="flex-row justify-end space-x-2">
                         <DialogClose asChild>
                             <Button type="button" variant="outline" disabled={isSavingDevice}>{t('common.cancel')}</Button>
                         </DialogClose>
                         <Button type="button" onClick={handleSaveDevice} disabled={isSavingDevice}>
                             {/* 조건부 버튼 텍스트 번역 */}
                             {isSavingDevice ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.saving')}</>) : t('common.save')}
                         </Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>

            {/* --- 삭제 확인 다이얼로그 --- */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                 <DialogContent className="sm:max-w-[425px]">
                     <DialogHeader>
                         <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
                         <DialogDescription>
                             {/* 설명 번역 (보간 포함) */}
                             {t('deleteDialog.description', { name: deletingDevice?.name })}
                         </DialogDescription>
                     </DialogHeader>
                     <DialogFooter className="flex-row justify-end space-x-2">
                         <DialogClose asChild>
                             <Button type="button" variant="outline" disabled={isDeletingDevice}>{t('common.cancel')}</Button>
                         </DialogClose>
                         <Button type="button" variant="destructive" onClick={handleDeleteDevice} disabled={isDeletingDevice}>
                              {/* 조건부 버튼 텍스트 번역 */}
                              {isDeletingDevice ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('common.deleting')}</>) : t('common.delete') + ' ' + t('common.confirm')}
                         </Button>
                     </DialogFooter>
                 </DialogContent>
             </Dialog>
        </div>
    );
}

export default App;
