import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class ProxyPoolEntity extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  proxy: string; // 代理字符串格式: http://username:password@host:port 或 host:port:username:password

  @Column({ type: 'varchar', nullable: true })
  name?: string; // 代理名称（可选，用于标识）

  @Column({ type: 'boolean', default: true })
  enabled: boolean; // 是否启用

  @CreateDateColumn()
  created_time: Date;

  @UpdateDateColumn()
  updated_time: Date;
}

