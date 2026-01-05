import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

// 任务状态枚举
export enum TaskStatus {
  NONE = 'NONE',                 // 未处理
  PROCESSING = 'PROCESSING',     // 处理中
  DONE = 'DONE',                 // 已完成
  ERROR = 'ERROR',               // 错误
}

// 账号数据类型
export interface AccountData {
  retailer?: string;
  mode?: string;
  proxy?: string;
  profileTitle?: string;
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  country?: string;
  state?: string;
  city?: string;
  address1?: string;
  address2?: string;
  phoneNumber?: string;
  zipCode?: string;
  cardNumber?: string;
  expiredMonth?: string;
  expiredYear?: string;
  securityCode?: string;
  loginId?: string;
  loginPass?: string;
  extra1?: string;
  codeMail?: string;
  smtp?: string;
  // IMAP 配置
  imapHost?: string;
  imapPort?: number | string;
  imapTls?: boolean;
  // 添加购物车时机: 'beforeLogin' | 'afterLogin'，默认为 'beforeLogin'
  addToCartTiming?: 'beforeLogin' | 'afterLogin';
  // 验证码服务配置: 'capmonster' | '2captcha'，默认为 'capmonster'
  captchaService?: 'capmonster' | '2captcha';
  loginCookies?: StoredCookie[];
}

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: 'strict' | 'lax' | 'no_restriction' | 'unspecified';
}

@Entity()
export class AccountEntity extends BaseEntity {
  @PrimaryColumn({ type: 'varchar' })
  mail: string;

  @Column({ type: 'json' })
  data: AccountData;

  @Column({ type: 'varchar', default: TaskStatus.NONE })
  status: TaskStatus;

  @Column({ type: 'varchar', default: '', nullable: true })
  statusText: string;

  @CreateDateColumn()
  created_time: Date;

  @UpdateDateColumn()
  updated_time: Date;
}
